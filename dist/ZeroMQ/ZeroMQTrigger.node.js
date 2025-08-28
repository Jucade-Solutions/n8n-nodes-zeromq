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
exports.ZeroMQTrigger = void 0;
const zmq = __importStar(require("zeromq"));
// Helper function to create a socket based on type
function createSocket(type) {
    switch (type) {
        case 'rep': return new zmq.Reply();
        case 'sub': return new zmq.Subscriber();
        case 'pull': return new zmq.Pull();
        default: throw new Error(`Invalid socket type: ${type}`);
    }
}
class ZeroMQTrigger {
    constructor() {
        this.description = {
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
            outputs: ["main" /* NodeConnectionType.Main */],
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
    }
    async trigger() {
        const socketType = this.getNodeParameter('socketType');
        const bindType = this.getNodeParameter('bindType');
        const address = this.getNodeParameter('socketAddress');
        const sock = createSocket(socketType);
        if (bindType === 'bind') {
            await sock.bind(address);
        }
        else {
            sock.connect(address);
        }
        if (socketType === 'sub') {
            const topic = this.getNodeParameter('topic', '');
            sock.subscribe(topic);
        }
        const run = async () => {
            try {
                for await (const messages of sock) {
                    const parts = (Array.isArray(messages) ? messages : [messages]).map(buf => buf.toString());
                    const receivedData = {};
                    if (socketType === 'sub') {
                        receivedData.topic = parts[0];
                        receivedData.message = parts.slice(1).join(' ');
                    }
                    else {
                        receivedData.message = parts.join(' ');
                    }
                    this.emit([this.helpers.returnJsonArray([receivedData])]);
                    if (socketType === 'rep') {
                        const response = this.getNodeParameter('response', 'ACK');
                        await sock.send(response);
                    }
                }
            }
            catch (error) {
                if (sock.closed)
                    return;
                console.error('Error in ZeroMQ trigger:', error);
            }
        };
        run();
        return { closeFunction: async () => { sock.close(); } };
    }
}
exports.ZeroMQTrigger = ZeroMQTrigger;
