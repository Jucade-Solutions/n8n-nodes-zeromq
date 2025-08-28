
import type {
	IExecuteFunctions,
	IDataObject,
	INodeType,
	INodeTypeDescription,
	INodeExecutionData,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import * as zmq from 'zeromq';

type SocketType = 'req' | 'rep' | 'pub' | 'sub' | 'push' | 'pull';
type ReceivableSocket = zmq.Reply | zmq.Pull | zmq.Subscriber;

// Helper function to create a socket based on type
function createSocket(type: SocketType): zmq.Publisher | zmq.Subscriber | zmq.Request | zmq.Reply | zmq.Push | zmq.Pull {
	switch (type) {
		case 'req': return new zmq.Request();
		case 'rep': return new zmq.Reply();
		case 'pub': return new zmq.Publisher();
		case 'sub': return new zmq.Subscriber();
		case 'push': return new zmq.Push();
		case 'pull': return new zmq.Pull();
		default: throw new Error(`Invalid socket type: ${type}`);
	}
}

export class ZeroMQ implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ZeroMQ',
		name: 'zeroMQ',
		icon: 'file:zeroMQ.svg',
		group: ['network'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["socketType"]}}',
		description: 'Interact with ZeroMQ sockets (PUSH, PULL, PUB, SUB, REQ, REP)',
		defaults: {
			name: 'ZeroMQ',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			// ... (the rest of the properties are correct)
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Receive',
						value: 'receive',
						description: 'Receive messages (acts as a Trigger)',
						action: 'Receive messages from a zeromq socket',
					},
					{
						name: 'Send',
						value: 'send',
						description: 'Send messages',
						action: 'Send messages to a zeromq socket',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Socket Type',
				name: 'socketType',
				type: 'options',
				required: true,
				default: 'push',
				options: [
					{ name: 'Request (REQ)', value: 'req' },
					{ name: 'Reply (REP)', value: 'rep' },
					{ name: 'Publish (PUB)', value: 'pub' },
					{ name: 'Subscribe (SUB)', value: 'sub' },
					{ name: 'Push', value: 'push' },
					{ name: 'Pull', value: 'pull' },
				],
			},
			{
				displayName: 'Action',
				name: 'bindType',
				type: 'options',
				options: [
					{ name: 'Bind', value: 'bind', description: 'Act as a server and listen' },
					{ name: 'Connect', value: 'connect', description: 'Connect to a server' },
				],
				default: 'connect',
			},
			{
				displayName: 'Socket Address',
				name: 'socketAddress',
				type: 'string',
				default: 'tcp://127.0.0.1:5555',
				required: true,
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '={{$json.data}}',
				required: true,
				displayOptions: { show: { operation: ['send'], socketType: ['req', 'pub', 'push'] } },
			},
			{
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				default: 'myTopic',
				displayOptions: { show: { operation: ['send'], socketType: ['pub'] } },
			},
			{
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['receive'], socketType: ['sub'] } },
				description: 'The topic to subscribe to. Leave empty for all.',
			},
			{
				displayName: 'Response (for REP)',
				name: 'response',
				type: 'string',
				default: 'ACK',
				displayOptions: { show: { operation: ['receive'], socketType: ['rep'] } },
				description: 'Automatic response to send upon receiving a message on a REP socket',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse | undefined> {
		const operation = this.getNodeParameter('operation') as string;
		if (operation !== 'receive') {
			return;
		}

		const socketType = this.getNodeParameter('socketType') as SocketType;
		const bindType = this.getNodeParameter('bindType') as 'bind' | 'connect';
		const address = this.getNodeParameter('socketAddress') as string;

		if (!['rep', 'sub', 'pull'].includes(socketType)) {
			throw new NodeOperationError(this.getNode(), `Socket type "${socketType}" is invalid for receive operation.`);
		}

		const sock = createSocket(socketType) as ReceivableSocket;

		if (bindType === 'bind') {
			await sock.bind(address);
		} else {
			sock.connect(address);
		}

		if (socketType === 'sub') {
			const topic = this.getNodeParameter('topic', '') as string;
			(sock as zmq.Subscriber).subscribe(topic);
		}

		const run = async () => {
			try {
				for await (const messages of sock) {
					const parts = (Array.isArray(messages) ? messages : [messages]).map(buf => buf.toString());
					const receivedData: IDataObject = {};

					if (socketType === 'sub') {
						receivedData.topic = parts[0];
						receivedData.message = parts.slice(1).join(' ');
					} else {
						receivedData.message = parts.join(' ');
					}

					this.emit([this.helpers.returnJsonArray([receivedData])]);

					if (socketType === 'rep') {
						const response = this.getNodeParameter('response', 'ACK') as string;
						await (sock as zmq.Reply).send(response);
					}
				}
			} catch (error) {
				if (sock.closed) return;
				console.error('Error in ZeroMQ trigger:', error);
			}
		};

		run();

		return { closeFunction: async () => { sock.close(); } };
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const operation = this.getNodeParameter('operation', 0) as string;
		if (operation !== 'send') return [this.helpers.returnJsonArray([])];

		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const socketType = this.getNodeParameter('socketType', 0) as SocketType;
		const bindType = this.getNodeParameter('bindType', 0) as 'bind' | 'connect';
		const address = this.getNodeParameter('socketAddress', 0) as string;

		if (!['req', 'pub', 'push'].includes(socketType)) {
			throw new NodeOperationError(this.getNode(), `Socket type "${socketType}" is invalid for send operation.`);
		}

		const sock = createSocket(socketType);

		if (bindType === 'bind') {
			await sock.bind(address);
		} else {
			sock.connect(address);
		}

		try {
			for (let i = 0; i < items.length; i++) {
				const message = this.getNodeParameter('message', i) as string;
				let response: IDataObject = { success: true, sent: message };

				if (socketType === 'pub') {
					const topic = this.getNodeParameter('topic', i) as string;
					await (sock as zmq.Publisher).send([topic, message]);
					response.topic = topic;
				} else if (socketType === 'req') {
					await (sock as zmq.Request).send(message);
				} else if (socketType === 'push') {
					await (sock as zmq.Push).send(message);
				}

				if (socketType === 'req') {
					const [result] = await (sock as zmq.Request).receive();
					response.response = result.toString();
				}

				returnData.push({ json: response, pairedItem: { item: i } });
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new NodeOperationError(this.getNode(), error);
			}
			throw error;
		} finally {
			if (!sock.closed) sock.close();
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
