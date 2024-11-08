// src/telnet-avr/messageQueue.ts

import { Connection } from "./connection";

export class MessageQueue {
    private queue: [string, string][] = []; // Array of [message, callbackChars]
    private queueCallbackChars: Record<string, Function[]> = {}; // Maps callbackChars to an array of callbacks
    private _queueLock: boolean = false; // Internal lock state
    private queueLockDate: number | null = null; // Tracks when the queue lock was set

    constructor(private connection: Connection) {
        this.startQueueCheck();
    }

    // Getter and setter for queueLock
    public get queueLock() {
        return this._queueLock;
    }

    public set queueLock(value: boolean) {
        this._queueLock = value;
        this.queueLockDate = value ? Date.now() : null; // Set lock date when locked
    }

    // Starts a periodic check on the queue, processes items when the connection is ready
    private startQueueCheck() {
        setInterval(() => {
            const lastWrite = this.connection.lastWrite;
            const lastMessageReceived = this.connection.lastMessageReceived;

            // Check if the connection is still active
            if (
                !this.connection.isConnected() ||
                lastWrite === null ||
                lastMessageReceived === null ||
                lastWrite - lastMessageReceived > 60 * 1000
            ) {
                this.connection.setConnectionReady(false);
                this.clearQueue();
                return;
            }

            // Unlock queue if the lock duration exceeds the threshold (5 seconds)
            if (this._queueLock && this.queueLockDate && Date.now() - this.queueLockDate > 5000) {
                this._queueLock = false;
                this.queueLockDate = null;
            }

            // Process queue if there are items and the queue is not locked
            if (this.queue.length > 0 && !this._queueLock) {
                this.processQueue();
            }
        }, 50);
    }

    // Processes the next item in the queue, unlocking if the lock duration exceeds the threshold
    private processQueue() {
        if (this.queue.length === 0 || this._queueLock) return;

        let [message, callbackChars] = this.queue[0];

        // Check if message starts with "?" or "!" to handle locking
        if (!message.startsWith("?") && !message.startsWith("!")) {
            if (Date.now() - (this.connection.lastWrite ?? 0) < 38) {
                setTimeout(() => this.processQueue(), 10);
                return;
            }
            this.connection.sendMessage(message + "\r\n", callbackChars, (error, response) => {
                this.queue.shift();
                if (callbackChars in this.queueCallbackChars) {
                    this.queueCallbackChars[callbackChars].forEach(callback => callback(error, response));
                    delete this.queueCallbackChars[callbackChars];
                }
                this._queueLock = false;
                this.queueLockDate = null;
            });
        } else {
            this._queueLock = true;
            this.queueLockDate = Date.now();

            if (message.startsWith("!")) {
                message = message.substring(1);
            }

            if (Date.now() - (this.connection.lastWrite ?? 0) < 38) {
                setTimeout(() => this.processQueue(), 10);
                return;
            }

            this.connection.sendMessage(message + "\r\n", callbackChars, (error, response) => {
                this.queue.shift();
                if (callbackChars in this.queueCallbackChars) {
                    this.queueCallbackChars[callbackChars].forEach(callback => callback(error, response));
                    delete this.queueCallbackChars[callbackChars];
                }
                this._queueLock = false;
                this.queueLockDate = null;
            });
        }
    }

    // Adds a message to the queue if it does not already exist
    public enqueue(message: string, callbackChars: string, onData: Function) {
        if (!this.queue.some(q => q[0] === message)) {
            this.queue.push([message, callbackChars]);
            if (!this.queueCallbackChars[callbackChars]) {
                this.queueCallbackChars[callbackChars] = [];
            }
            this.queueCallbackChars[callbackChars].push(onData);
        }
    }

    // Clears all messages from the queue and resets callback mappings
    public clearQueue() {
        this.queue = [];
        this.queueCallbackChars = {};
        this._queueLock = false;
        this.queueLockDate = null; // Reset lock date on queue clear
    }
}
