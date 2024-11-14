// src/telnet-avr/connection.ts
import net from "net";
import { TelnetAvr } from './telnetAvr';
import { MessageQueue } from "./messageQueue";
import DataHandler from "./dataHandler";
import { addExitHandler } from "../exitHandler";
import { findDevices } from '../discovery';

let onExitCalled = false;

export class Connection {
    private socket: net.Socket | null = null;
    private lastConnect: number | null = null;
    private messageQueue: MessageQueue;
    private connectionReady = false;
    public lastWrite: number | null = null;
    private clearQueueTimeout: NodeJS.Timeout | null = null;
    private disconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectCounter = 0;
    private isConnecting: number | null = null;
    private log: any;
    private dataHandler: DataHandler;
    private host: string;
    private port: number;
    private avr: any;
    private maxReconnectAttempts: number = 5;

    constructor(telnetThis: TelnetAvr) {
        this.avr = telnetThis.avr;
        this.port = telnetThis.port;
        this.host = telnetThis.host;
        this.log = telnetThis.avr.log;
        this.messageQueue = new MessageQueue(this);
        this.dataHandler = new DataHandler(telnetThis, this.messageQueue);
        addExitHandler(this.disconnectOnExit.bind(this), this);
    }

    private disconnectOnExit() {
        onExitCalled = true;
        if (this.connectionReady) {
            this.connectionReady = false;
            this.disconnect();
        }
    }

    connect(callback: () => void = () => {}) {
        if (!this.connectionReady && this.isConnecting !== null && Date.now() - this.isConnecting < 30000) {
            return;
        }
        if (this.connectionReady && this.socket) {
            if (Date.now() - (this.lastConnect ?? 0) > 15 * 1000) {
                this.reconnect(callback);
            } else {
                this.log.debug("Already connected, delaying callback.");
                setTimeout(callback, 1500);
            }
            return;
        }

        if (!this.socket) {
            this.initializeSocket(callback);
        }
    }

    private initializeSocket(callback: () => void) {
        this.isConnecting = Date.now();
        this.socket = new net.Socket();
        this.socket.setTimeout(2 * 60 * 60 * 1000);

        this.socket.on("connect", () => {
            this.reconnectCounter = 0;
            this.setConnectionReady(true);
            this.lastConnect = Date.now();
            this.log.debug("Socket connected.");

            this.sendMessage("?P", "PWR", async () => {
                try {
                    callback();
                } catch (e) {
                    this.log.error("Connect callback error:", e);
                }

                try {
                    this.onConnect();
                } catch (e) {
                    this.log.error("Connect onConnect error:", e);
                }
            });
        });

        this.socket.on("close", () => this.handleClose());
        this.socket.on("data", (data) => this.handleData(data));
        this.socket.on("error", (err) => this.handleError(err));

        this.socket.connect(this.port, this.host);
    }

    private handleClose() {
        this.setConnectionReady(false);

        if (onExitCalled) return;
        this.log.debug("Socket closed, attempting reconnect.");
        this.tryReconnect();
    }

    private handleData(data: Buffer) {
        this.dataHandler.handleData(data);
    }

    private handleError(err: Error) {
        this.log.error("Connection error:", err);
        if (err.message.includes("CONN")) {
            this.setConnectionReady(false);
            this.onDisconnect();
        }
    }

    private tryReconnect() {
        if (onExitCalled || this.reconnectCounter >= this.maxReconnectAttempts) return;

        this.reconnectCounter++;
        const delay = this.reconnectCounter > 30 ? 60 : 15;

        setTimeout(() => {
            this.log.info("Attempting reconnection...");
            this.connect();
        }, delay * 1000);
    }

    async reconnect(callback: () => void) {
        if (this.reconnectCounter >= this.maxReconnectAttempts) {
            const TELNET_PORTS = this.avr.platform.TELNET_PORTS || [23, 24, 8102];
            const devices = await findDevices(this.avr.device.origName || this.avr.device.name, TELNET_PORTS, this.log, 1);

            if (devices.length > 0) {
                const updatedDevice = devices[0];
                this.host = updatedDevice.ip;
                this.port = updatedDevice.port;
                this.log.info(`Updated device connection info: ${this.host}:${this.port}`);
                this.reconnectCounter = 0; // Reset counter after successful discovery
            }
        }

        if (!this.socket) {
            this.initializeSocket(callback);
        } else if (!this.lastConnect || Date.now() - (this.lastConnect ?? 0) > 15 * 1000) {
            this.log.debug("Reconnecting socket.");
            this.socket.connect(this.port, this.host, callback);
        }
    }

    disconnect() {
        this.setConnectionReady(false);
        this.onDisconnect();

        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }
        this.log.debug('telnet> disconnected!');
    }

    isConnected() {
        return this.connectionReady;
    }

    async sendMessage(message: string, callbackChars?: string, callback?: (error: any, response: string) => void) {
        if (!this.connectionReady) {
            this.tryReconnect();
        }

        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }

        this.disconnectTimeout = setTimeout(() => this.disconnect(), 2 * 60 * 60 * 1000);

        if (this.connectionReady && callbackChars === undefined) {
            if (Date.now() - (this.lastWrite ?? 0) < 38) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            this.directSend(message, callback);
        } else {
            this.queueMessage(message, callbackChars, callback);
        }
    }

    public directSend(message: string, callback?: (error: any, response: string) => void) {
        if (!this.connectionReady) {
            this.log.warn("Connection not ready, skipping direct send.");
            return;
        }

        if (message.startsWith("!")) {
            message = message.substring(1);
        }

        this.log.debug('telnet write>', message);
        this.socket?.write(message + "\r\n");
        this.setLastWrite(Date.now());
        callback?.(null, `${message}:SENT`);
    }

    private queueMessage(message: string, callbackChars?: string, callback?: (error: any, response: string) => void) {
        this.messageQueue.enqueue(message, callbackChars, callback!);

        if (this.clearQueueTimeout) {
            clearTimeout(this.clearQueueTimeout);
        }

        this.clearQueueTimeout = setTimeout(() => {
            this.messageQueue.clearQueue();
        }, 5 * 60 * 1000);
    }

    public onDisconnect() {
        this.log.debug("Disconnected!");
    }

    public onConnect() {
        this.log.debug("Connected!");
    }

    public setConnectionReady(ready: boolean) {
        this.connectionReady = ready;
    }

    public setLastWrite(timestamp: number) {
        this.lastWrite = timestamp;
    }

    // Accessor for lastMessageReceived from DataHandler
    get lastMessageReceived(): number | null {
        return this.dataHandler.lastMessageReceived;
    }
}
