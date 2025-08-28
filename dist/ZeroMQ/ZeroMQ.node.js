"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZeroMQ = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const zmq = __importStar(require("zeromq"));
// Helper function to create a socket based on type
function createSocket(type) {
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
class ZeroMQ {
    constructor() {
        this.description = {
            displayName: 'ZeroMQ',
            name: 'zeroMQ',
            icon: 'file:zeroMQ.svg',
            group: ['network'],
            version: 1,
            subtitle: '={{$parameter["operation"] + ": " + $parameter["socketType"]}}',
            description: 'Sends or receives ZeroMQ messages as a one-time action',
            defaults: {
                name: 'ZeroMQ',
            },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            properties: [
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'Send',
                            value: 'send',
                            description: 'Send a message',
                        },
                        {
                            name: 'Receive',
                            value: 'receive',
                            description: 'Receive a single message',
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
    }
    async execute() {
        const operation = this.getNodeParameter('operation', 0);
        const returnData = [];
        if (operation === 'send') {
            const items = this.getInputData();
            const socketType = this.getNodeParameter('socketType', 0);
            const bindType = this.getNodeParameter('bindType', 0);
            const address = this.getNodeParameter('socketAddress', 0);
            if (!['req', 'pub', 'push'].includes(socketType)) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Socket type "${socketType}" is invalid for send operation.`);
            }
            const sock = createSocket(socketType);
            await (bindType === 'bind' ? sock.bind(address) : sock.connect(address));
            try {
                for (let i = 0; i < items.length; i++) {
                    const message = this.getNodeParameter('message', i);
                    let response = { success: true, sent: message };
                    if (socketType === 'pub') {
                        const topic = this.getNodeParameter('topic', i);
                        await sock.send([topic, message]);
                        response.topic = topic;
                    }
                    else {
                        await sock.send(message);
                    }
                    if (socketType === 'req') {
                        const [result] = await sock.receive();
                        response.response = result.toString();
                    }
                    returnData.push({ json: response, pairedItem: { item: i } });
                }
            }
            finally {
                if (!sock.closed)
                    sock.close();
            }
        }
        else if (operation === 'receive') {
            const socketType = this.getNodeParameter('socketType', 0);
            const bindType = this.getNodeParameter('bindType', 0);
            const address = this.getNodeParameter('socketAddress', 0);
            if (!['pull', 'sub', 'rep'].includes(socketType)) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Socket type "${socketType}" is invalid for a receive action.`);
            }
            const sock = createSocket(socketType);
            await (bindType === 'bind' ? sock.bind(address) : sock.connect(address));
            try {
                if (socketType === 'sub') {
                    const topic = this.getNodeParameter('topic', 0, '');
                    sock.subscribe(topic);
                }
                const messages = await sock.receive();
                const parts = (Array.isArray(messages) ? messages : [messages]).map(buf => buf.toString());
                const receivedJson = {};
                if (socketType === 'sub') {
                    receivedJson.topic = parts[0];
                    receivedJson.message = parts.slice(1).join(' ');
                }
                else {
                    receivedJson.message = parts.join(' ');
                }
                returnData.push({ json: receivedJson });
                if (socketType === 'rep') {
                    const response = this.getNodeParameter('response', 0, 'ACK');
                    await sock.send(response);
                }
            }
            finally {
                if (!sock.closed)
                    sock.close();
            }
        }
        return [this.helpers.returnJsonArray(returnData)];
    }
}
exports.ZeroMQ = ZeroMQ;
