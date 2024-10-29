// src/telnet-avr/connection.ts
import net from "net";
import { MessageQueue } from "./messageQueue";

export class Connection {
    private socket: net.Socket | null = null;
    private lastConnect: number | null = null;
    private messageQueue: MessageQueue;
    public connectionReady = false;
    private lastWrite: number | null = null;
    private lastMessageReceived: number | null = null;
    public onData: (data: Buffer) => void = () => {}; // Callback für empfangene Daten
    private queueCallbackChars: { [key: string]: Function[] } = {};
    private queueQueries: string[] = [];
    private clearQueueTimeout: NodeJS.Timeout | null = null;
    private disconnectTimeout: NodeJS.Timeout | null = null;

    constructor(private host: string, private port: number) {
        this.messageQueue = new MessageQueue(this.sendMessage.bind(this));
    }

    connect(onConnect: () => void) {
        this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
            this.connectionReady = true;
            this.lastConnect = Date.now();
            onConnect();
            this.messageQueue.setConnectionReady(this.connectionReady);
        });

        this.socket.on("data", (data) => {
            this.onData(data);
            this.lastMessageReceived = Date.now();
            this.messageQueue.setLastMessageReceived(this.lastMessageReceived);
        });

        this.socket.on("error", (err) => {
            console.error("Connection error:", err);
            this.connectionReady = false;
            this.messageQueue.setConnectionReady(false);
        });

        try {
            this.onConnect(); // Call the disconnect handler
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

        try {
            this.onDisconnect(); // Call the disconnect handler
        } catch (e) {
            console.error('Connection> onDisconnect Error');
            console.error(e);
        }
    }

    isConnected() {
        return this.connectionReady;
    }

    sendMessage(message: string, callbackChars?: string, onData?: (error: any, response: string) => void) {
        if (this.connectionReady && this.lastWrite !== null && this.lastWrite - this.lastMessageReceived! > 60 * 1000) {
            // No response? Not connected anymore?
            this.connectionReady = false;
            this.messageQueue.clearQueue(); // Clear queue on disconnection
            try {
                this.onDisconnect(); // Call the disconnect handler
            } catch (e) {
                console.error('Connection> onDisconnect Error');
                console.error(e);
            }
        }

        if (callbackChars === undefined) {
            if (this.connectionReady) {
                while (this.lastWrite && Date.now() - this.lastWrite < 38) {
                    require("deasync").sleep(10);
                }
                this.socket?.write(message + "\r\n");
                this.lastWrite = Date.now();

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
            this.messageQueue.enqueue(message);
        }

        if (!this.queueCallbackChars[callbackChars]) {
            this.queueCallbackChars[callbackChars] = [];
        }
        this.queueCallbackChars[callbackChars].push(onData!);
        this.queueQueries.push(message);

        if (!this.connectionReady) {
            setTimeout(() => {
                this.connect(() => {});
            }, 0);
        }

        let whileCounter = 0;
        while (!this.connectionReady && whileCounter++ <= 15) {
            require("deasync").sleep(1000);
        }

        if (!this.connectionReady) {
            this.connect(() => {});

            whileCounter = 0;
            while (!this.connectionReady && whileCounter++ < 150) {
                require("deasync").sleep(100);
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
        // Logic for handling disconnection
        // For example:
        console.log("Disconnected!");
    }

    public onConnect() {
        // Logic for handling disconnection
        // For example:
        console.log("Disconnected!");

    }
}
