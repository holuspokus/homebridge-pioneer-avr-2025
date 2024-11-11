// src/telnet-avr/connection.ts
import net from "net";
import { TelnetAvr } from './telnetAvr';
import { MessageQueue } from "./messageQueue";
import DataHandler from "./dataHandler";
import { addExitHandler } from "../exitHandler";

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
    private log: any;
    private dataHandler: DataHandler; // DataHandler instance
    private host: string;
    private port: number;
    private isConnecting: number | null = null;

    constructor(telnetAvr: TelnetAvr) {
        this.port = telnetAvr.port;
        this.host = telnetAvr.host;
        this.log = telnetAvr.log;
        this.messageQueue = new MessageQueue(this);
        this.dataHandler = new DataHandler(telnetAvr, this.messageQueue); // Initialize DataHandler
        addExitHandler(this.disconnectOnExit.bind(this), this);
    }

    private disconnectOnExit() {
        console.log('> disconnectOnExit called.', this.connectionReady);
        onExitCalled = true;
        if (this.connectionReady) {
            this.connectionReady = false;
            this.disconnect();
        }
    }

    connect(callback: () => void = () => {}) {
        if (!this.connectionReady && this.isConnecting !== null && Date.now() - this.isConnecting < 30000){
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
        this.isConnecting = Date.now()
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
        this.socket.on("data", (data) => this.handleData(data)); // Directly passing Buffer
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
        // Directly pass data as Buffer to DataHandler
        this.dataHandler.handleData(data);
    }

    private handleError(err: Error) {
        this.log.error("Connection error:", err);
        this.setConnectionReady(false);
        if (err.message.includes("CONN")) {
            this.onDisconnect();
        }
    }

    private tryReconnect() {
        if (onExitCalled) return;

        this.reconnectCounter++;
        const delay = this.reconnectCounter > 30 ? 60 : 15;

        setTimeout(() => {
            this.log.info("Attempting reconnection...");
            this.connect();
        }, delay * 1000);
    }

    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }
        this.log.debug('telnet> disconnect...')
        this.setConnectionReady(false);
        this.onDisconnect();
    }

    isConnected() {
        return this.connectionReady;
    }

    async sendMessage(message: string, callbackChars?: string, callback?: (error: any, response: string) => void) {
        if (!this.connectionReady) {
            this.connect();
        }

        if (this.connectionReady && callbackChars === undefined && (Date.now() - (this.lastWrite ?? 0) > 38)) {
            this.directSend(message, callback);
        }else{
            this.queueMessage(message, callbackChars, callback);
        }

    }

    public directSend(message: string, callback?: (error: any, response: string) => void) {
        if (!this.connectionReady) {
            this.log.warn("Connection not ready, skipping direct send.");
            return;
        }

        this.log.debug('telnet write>', message)
        this.socket?.write(message + "\r\n");
        this.setLastWrite(Date.now());
        callback?.(null, `${message}:SENT`);
    }

    private queueMessage(message: string, callbackChars?: string, callback?: (error: any, response: string) => void) {
        // if (onData && typeof(callbackChars) === undefined){
        //     this.onData()
        // }

        this.messageQueue.enqueue(message, callbackChars, callback!);

        if (this.clearQueueTimeout) {
            clearTimeout(this.clearQueueTimeout);
        }

        this.clearQueueTimeout = setTimeout(() => {
            this.messageQueue.clearQueue();
        }, 5 * 60 * 1000);

        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }

        this.disconnectTimeout = setTimeout(() => this.disconnect(), 2 * 60 * 60 * 1000);
    }

    private reconnect(callback: () => void) {
        if (onExitCalled) return;

        if (!this.socket) {
            this.initializeSocket(callback);
        } else if (Date.now() - (this.lastConnect ?? 0) > 15 * 1000) {
            this.log.debug("Reconnecting socket.");
            this.socket.connect(this.port, this.host, callback);
        }
    }

    public onDisconnect() {
        this.log.debug("Disconnected!");
    }

    public onConnect() {
        this.log.debug("Connected!");
    }

    public setConnectionReady(ready: boolean) {
        // this.log.debug('set setConnectionReady', ready)
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
