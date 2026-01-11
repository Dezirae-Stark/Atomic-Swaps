// libp2p Node for XMR-BTC Atomic Swaps
// Creates a libp2p node capable of connecting to ASB providers via Tor

import { createLibp2p, Libp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { multiaddr } from '@multiformats/multiaddr';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import { encode, decode } from 'cbor-x';
import type { Connection, Stream } from '@libp2p/interface';

import {
  MAINNET_RENDEZVOUS_POINTS,
  TESTNET_RENDEZVOUS_POINTS,
  ASB_PROTOCOL_QUOTE,
  ASB_PROTOCOL_SWAP,
  ASB_PROTOCOL_TRANSFER_PROOF,
  ASB_PROTOCOL_ENCRYPTED_SIGNATURE,
  AsbQuoteRequest,
  AsbQuoteResponse,
  AsbSwapRequest,
  AsbSwapResponse,
} from './types';

export interface NodeConfig {
  isMainnet: boolean;
  torProxyUrl?: string;
  listenAddresses?: string[];
}

export interface SwapNode {
  node: Libp2p;
  isStarted: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  connectToPeer: (multiaddrStr: string) => Promise<Connection>;
  requestQuote: (peerId: string, btcAmount: bigint) => Promise<AsbQuoteResponse>;
  initiateSwap: (peerId: string, request: AsbSwapRequest) => Promise<AsbSwapResponse>;
  sendEncryptedSignature: (peerId: string, swapId: string, signature: Uint8Array) => Promise<void>;
  waitForTransferProof: (peerId: string, swapId: string) => Promise<Uint8Array>;
}

// Singleton node instance
let swapNode: SwapNode | null = null;

// Helper: Send message and receive response via stream
async function sendAndReceive<T, R>(stream: Stream, message: T): Promise<R> {
  const encoded = encode(message);

  let response: R | undefined;

  await pipe(
    [encoded],
    lp.encode,
    stream,
    lp.decode,
    async function* (source) {
      for await (const data of source) {
        response = decode(data.subarray()) as R;
        break;
      }
    }
  );

  if (!response) {
    throw new Error('No response received');
  }

  return response;
}

// Helper: Send message without expecting response
async function sendMessage<T>(stream: Stream, message: T): Promise<void> {
  const encoded = encode(message);
  await pipe([encoded], lp.encode, stream);
}

// Helper: Receive message from stream
async function receiveMessage<T>(stream: Stream): Promise<T> {
  let result: T | undefined;

  await pipe(
    stream,
    lp.decode,
    async function* (source) {
      for await (const data of source) {
        result = decode(data.subarray()) as T;
        break;
      }
    }
  );

  if (!result) {
    throw new Error('No message received');
  }

  return result;
}

export async function createSwapNode(config: NodeConfig): Promise<SwapNode> {
  if (swapNode?.isStarted) {
    return swapNode;
  }

  const rendezvousPoints = config.isMainnet
    ? MAINNET_RENDEZVOUS_POINTS
    : TESTNET_RENDEZVOUS_POINTS;

  // Create libp2p node
  const node = await createLibp2p({
    addresses: {
      listen: config.listenAddresses || [],
    },
    transports: [
      tcp(),
      webSockets(),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
    },
    peerDiscovery: [
      bootstrap({
        list: rendezvousPoints,
      }),
    ],
  });

  // Helper: Find existing connection or throw
  const findOrConnect = async (peerId: string): Promise<Connection> => {
    const connections = node.getConnections();
    const existing = connections.find(c => c.remotePeer.toString() === peerId);
    if (existing) return existing;

    // Try to find peer in peer store and connect
    try {
      const peerInfo = await node.peerStore.get(node.peerId);
      if (peerInfo?.addresses?.length) {
        return await node.dial(peerInfo.addresses[0].multiaddr);
      }
    } catch {
      // Peer not in store
    }

    throw new Error(`Cannot find peer: ${peerId}`);
  };

  const instance: SwapNode = {
    node,
    isStarted: false,

    async start() {
      if (this.isStarted) return;
      await node.start();
      this.isStarted = true;
      console.log('Swap node started with peer ID:', node.peerId.toString());
    },

    async stop() {
      if (!this.isStarted) return;
      await node.stop();
      this.isStarted = false;
      console.log('Swap node stopped');
    },

    async connectToPeer(multiaddrStr: string): Promise<Connection> {
      const ma = multiaddr(multiaddrStr);
      const connection = await node.dial(ma);
      console.log('Connected to peer:', connection.remotePeer.toString());
      return connection;
    },

    async requestQuote(peerId: string, btcAmount: bigint): Promise<AsbQuoteResponse> {
      const connection = await findOrConnect(peerId);
      const stream = await connection.newStream(ASB_PROTOCOL_QUOTE);

      const request: AsbQuoteRequest = { btc_amount: btcAmount };
      const response = await sendAndReceive<AsbQuoteRequest, AsbQuoteResponse>(
        stream,
        request
      );

      return response;
    },

    async initiateSwap(peerId: string, request: AsbSwapRequest): Promise<AsbSwapResponse> {
      const connection = await findOrConnect(peerId);
      const stream = await connection.newStream(ASB_PROTOCOL_SWAP);

      const response = await sendAndReceive<AsbSwapRequest, AsbSwapResponse>(
        stream,
        request
      );

      return response;
    },

    async sendEncryptedSignature(peerId: string, swapId: string, signature: Uint8Array): Promise<void> {
      const connection = await findOrConnect(peerId);
      const stream = await connection.newStream(ASB_PROTOCOL_ENCRYPTED_SIGNATURE);

      const message = { swap_id: swapId, encrypted_signature: signature };
      await sendMessage(stream, message);
    },

    async waitForTransferProof(peerId: string, swapId: string): Promise<Uint8Array> {
      // Set up a stream handler to receive the transfer proof
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Transfer proof timeout'));
        }, 600000); // 10 minute timeout

        // Set up handler for transfer proof
        node.handle(ASB_PROTOCOL_TRANSFER_PROOF, async ({ stream }) => {
          try {
            const data = await receiveMessage<{ swap_id: string; proof: Uint8Array }>(stream);
            if (data.swap_id === swapId) {
              clearTimeout(timeout);
              resolve(data.proof);
            }
          } catch (error) {
            console.error('Error receiving transfer proof:', error);
          }
        });
      });
    },
  };

  swapNode = instance;
  return instance;
}

export function getSwapNode(): SwapNode | null {
  return swapNode;
}

export async function shutdownSwapNode(): Promise<void> {
  if (swapNode) {
    await swapNode.stop();
    swapNode = null;
  }
}
