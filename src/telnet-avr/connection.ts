// src/telnet-avr/connection.ts
import net from "net";
import { MessageQueue } from "./messageQueue";

export class Connection {
    private socket: net.Socket | null = null;
    private lastConnect: number | null = null;
    private messageQueue: MessageQueue;
    private connectionReady = false;
    private lastWrite: number | null = null;
    private lastMessageReceived: number | null = null;
    private queueCallbackChars: { [key: string]: Function[] } = {};
    private queueQueries: string[] = [];
    private clearQueueTimeout: NodeJS.Timeout | null = null;
    private disconnectTimeout: NodeJS.Timeout | null = null;
    private log: any;

    public onDataCallback: (data: string) => void = () => {};

    constructor(private host: string, private port: number, private log: any) {
        this.messageQueue = new MessageQueue(this.sendMessage.bind(this), log);
        this.log = log;
    }

    connect(onConnect: () => void) {
        this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
            this.setConnectionReady(true);
            this.lastConnect = Date.now();
            onConnect();
        });

        this.socket.on("data", (data) => {
            this.onDataCallback(data.toString());
            this.setLastMessageReceived(Date.now());
        });

        this.socket.on("error", (err) => {
            console.error("Connection error:", err);
            this.setConnectionReady(false);
        });

        try {
            this.onConnect();
        } catch (e) {
            console.error('Connection> onDisconnect Error');
            console.error(e);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }

        this.setConnectionReady(false);

        try {
            this.onDisconnect();
        } catch (e) {
            console.error('Connection> onDisconnect Error');
            console.error(e);
        }
    }

    isConnected() {
        return this.connectionReady;
    }

    async sendMessage(message: string, callbackChars?: string, onData?: (error: any, response: string) => void) {
        if (this.connectionReady && this.lastWrite !== null && this.lastWrite - this.lastMessageReceived! > 60 * 1000) {
            this.setConnectionReady(false);
            this.messageQueue.clearQueue();
            try {
                this.onDisconnect();
            } catch (e) {
                console.error('Connection> onDisconnect Error');
                console.error(e);
            }
        }

        if (callbackChars === undefined) {
            if (this.connectionReady) {
                while (this.lastWrite && Date.now() - this.lastWrite < 38) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                this.socket?.write(message + "\r\n");
                this.setLastWrite(Date.now());

                try {
                    onData?.(null, message + ":SENT");
                } catch (e) {
                    console.error(e);
                }
            }
            return;
        }

        if (this.clearQueueTimeout) {
            clearTimeout(this.clearQueueTimeout);
        }
        this.clearQueueTimeout = setTimeout(() => {
            this.messageQueue.clearQueue();
        }, 5 * 60 * 1000);

        if (!this.queueQueries.includes(message)) {
            this.messageQueue.enqueue(message, callbackChars, onData!);
        }

        if (!this.connectionReady) {
            setTimeout(() => {
                this.connect(() => {});
            }, 0);
        }

        let whileCounter = 0;
        while (!this.connectionReady && whileCounter++ <= 15) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!this.connectionReady) {
            this.connect(() => {});

            whileCounter = 0;
            while (!this.connectionReady && whileCounter++ < 150) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (!this.connectionReady) {
            console.error("Connection still not ready...");
            return;
        }

        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }
        this.disconnectTimeout = setTimeout(() => this.disconnect(), 2 * 60 * 60 * 1000);
    }

    public onDisconnect() {
        console.log("Disconnected!");
    }

    public onConnect() {
        console.log("Connected!");
    }

    // Set the connection readiness status
    public setConnectionReady(ready: boolean) {
        this.connectionReady = ready;
        this.messageQueue.setConnectionReady(ready);
    }

    // Set the last write timestamp
    public setLastWrite(timestamp: number) {
        this.lastWrite = timestamp;
    }

    // Set the last message received timestamp
    public setLastMessageReceived(timestamp: number) {
        this.lastMessageReceived = timestamp;
    }
}
