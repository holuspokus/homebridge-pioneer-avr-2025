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
    private connectionReady: boolean = false;
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
    private maxReconnectAttempts: number = 10;
    private isReconnect: boolean = false;
    private checkConnInterval!: NodeJS.Timeout;

    constructor(telnetThis: TelnetAvr) {
        this.avr = telnetThis.avr;
        this.port = telnetThis.port;
        this.host = telnetThis.host;
        this.log = telnetThis.avr.log;
        this.messageQueue = new MessageQueue(this);
        this.dataHandler = new DataHandler(telnetThis, this.messageQueue);
        addExitHandler(this.disconnectOnExit.bind(this), this);

        setTimeout(() => {
            clearInterval(this.checkConnInterval);
            this.checkConnInterval = setInterval(()=>{
                  if (this.connectionReady && this.reconnectCounter === 0 && this.isConnecting === null && this.lastWrite !== null && this.lastMessageReceived !== null && this.lastWrite - this.lastMessageReceived > 10000 && Date.now() - this.lastMessageReceived > 60 * 1000 ) {
                      this.log.warn(` > Device ${this.avr.device.name} not responding.`);
                      this.connectionReady = false;
                      this.messageQueue.clearQueue();
                      this.disconnect();
                      this.connect();
                  }
            }, 3107);
        }, 5000);

    }

    private disconnectOnExit() {
        onExitCalled = true;
        clearInterval(this.checkConnInterval);
        if (this.connectionReady) {
            this.connectionReady = false;
            this.disconnect();
        }
    }

    connect(callback: () => void = () => {}) {
        if (!this.connectionReady && this.isConnecting !== null && Date.now() - this.isConnecting < 30000) {
            setTimeout(callback, 1500);
            return;
        }

        this.log.debug('connect() called');

        if (this.socket) {
            if (!this.connectionReady && Date.now() - (this.lastConnect ?? 0) > 15 * 1000) {
                this.reconnect(callback);
            } else if (this.connectionReady) {
                this.log.debug("Already connected, delaying callback.");
                setTimeout(callback, 1500);
            }else{
                try {
                    callback();
                } catch (e) {
                    this.log.error("Connect callback error:", e);
                }
            }
        } else {
        // if (!this.socket) {
            this.initializeSocket(callback);
        }
    }

    private initializeSocket(callback: () => void) {
        this.log.debug('initializeSocket() called');
        this.isConnecting = Date.now();
        this.socket = new net.Socket();
        this.socket.setTimeout(30 * 1000);

        this.socket.removeAllListeners("connect");

        this.socket.on("connect", () => {
            if (onExitCalled  || !this.socket) return;
            if(this.socket.destroyed) return;
            if (this.socket.connecting || this.socket.readyState !== 'open') return;

            this.reconnectCounter = 0;
            this.lastMessageReceived = null;
            this.setConnectionReady(true);
            this.lastConnect = Date.now();
            this.log.debug("Socket connected.");

            this.sendMessage("?P", "PWR", async () => {
                if (!this.isReconnect) {
                    try {
                        callback();
                    } catch (e) {
                        this.log.error("Connect initializeSocket callback error:", e);
                    }
                    this.isReconnect = true;
                }else{
                   this.log.info('>> successfuly reconnected ' + this.avr.device.name)
                }

                try {
                    this.onConnect();
                } catch (e) {
                    this.log.error("Connect initializeSocket onConnect error:", e);
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
        this.dataHandler?.handleData(data);
    }

    private handleError(err: Error) {
        this.log.error("Connection error:", err);
        if (err.message.includes("CONN")) {
            this.setConnectionReady(false);
            this.onDisconnect();
        }
    }

    private tryReconnect() {
        if (onExitCalled) return;

        this.log.debug('tryReconnect() called');

        this.reconnectCounter++;
        const delay = this.reconnectCounter > 30 ? 60 : 15;

        setTimeout(() => {
            if (onExitCalled || this.connectionReady) return;
            this.log.info("Attempting reconnection...");
            this.connect();
        }, delay * 1000);
    }

    async reconnect(callback: () => void) {
        if (onExitCalled || this.connectionReady || !this.socket) return;
        if (this.socket.connecting || this.socket.readyState === 'open') {
            try {
                callback();
            } catch (error) {
                this.log.debug('reconnect callback error', error)
            }
        };

        this.log.debug('reconnect() called')

        if (this.reconnectCounter >= this.maxReconnectAttempts && this.avr.device.source == 'bonjour') {
            const TELNET_PORTS = this.avr.platform.TELNET_PORTS || [23, 24, 8102];
            const devices = await findDevices(this.avr.device.origName, TELNET_PORTS, this.log, 1);

            if (devices.length > 0) {
                const updatedDevice = devices[0];
                this.host = updatedDevice.host;
                this.port = updatedDevice.port;
                this.log.info(`Updated device ${this.avr.device.name} connection info: ${this.host}:${this.port}`);
                this.reconnectCounter = 0; // Reset counter after successful discovery
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        if (!this.socket) {
            this.initializeSocket(callback);
        } else if (!this.lastConnect || Date.now() - (this.lastConnect ?? 0) > 15 * 1000) {
            this.log.debug("Reconnecting socket.");
            this.socket.connect(this.port, this.host, callback);
        }else{
            setTimeout(() => {
                try {
                    callback();
                } catch (error) {
                    this.log.debug('reconnect callback error', error)
                }
            }, 30000);
        }
    }

    disconnect() {
        this.log.debug('disconnect() called');
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

        this.disconnectTimeout = setTimeout(() => this.disconnect(), 5 * 60 * 1000);

        // if (this.connectionReady && callbackChars === undefined) {
        //     if (Date.now() - (this.lastWrite ?? 0) < 38) {
        //         await new Promise(resolve => setTimeout(resolve, 50));
        //     }
        if (
            !message.startsWith("?") &&
            !message.startsWith("!") &&
            this.connectionReady && callbackChars === undefined && this.messageQueue.queue.length === 0) {
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
        }, 15 * 1000);
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
        return this.dataHandler?.lastMessageReceived || null;
    }

    // Setter for the last message received timestamp
    set lastMessageReceived(value: number | null) {
        if (this.dataHandler) {
            this.dataHandler.lastMessageReceived = value;
        }
    }
}
