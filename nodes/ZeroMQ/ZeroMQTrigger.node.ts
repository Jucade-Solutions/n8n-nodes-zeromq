
import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import * as zmq from 'zeromq';

type SocketType = 'rep' | 'sub' | 'pull';
type ReceivableSocket = zmq.Reply | zmq.Pull | zmq.Subscriber;

// Helper function to create a socket based on type
function createSocket(type: SocketType): ReceivableSocket {
	switch (type) {
		case 'rep': return new zmq.Reply();
		case 'sub': return new zmq.Subscriber();
		case 'pull': return new zmq.Pull();
		default: throw new Error(`Invalid socket type: ${type}`);
	}
}

export class ZeroMQTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ZeroMQ Trigger',
		name: 'zeroMQTrigger',
		icon: 'file:zeroMQ.png',
		group: ['trigger'],
		version: 1,
		description: 'Starts a workflow when a ZeroMQ message is received',
		defaults: {
			name: 'ZeroMQ Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Socket Type',
				name: 'socketType',
				type: 'options',
				required: true,
				default: 'pull',
				options: [
					{ name: 'Reply (REP)', value: 'rep' },
					{ name: 'Subscribe (SUB)', value: 'sub' },
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
				default: 'bind',
			},
			{
				displayName: 'Socket Address',
				name: 'socketAddress',
				type: 'string',
				default: 'tcp://127.0.0.1:5555',
				required: true,
			},
			{
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				default: '',
				displayOptions: { show: { socketType: ['sub'] } },
				description: 'The topic to subscribe to. Leave empty for all.',
			},
			{
				displayName: 'Response (for REP)',
				name: 'response',
				type: 'string',
				default: 'ACK',
				displayOptions: { show: { socketType: ['rep'] } },
				description: 'Automatic response to send upon receiving a message on a REP socket',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse | undefined> {
		const socketType = this.getNodeParameter('socketType') as SocketType;
		const bindType = this.getNodeParameter('bindType') as 'bind' | 'connect';
		const address = this.getNodeParameter('socketAddress') as string;

		const sock = createSocket(socketType);

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
}
