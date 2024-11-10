// src/telnet-avr/messageQueue.ts

import { Connection } from "./connection";

export class MessageQueue {
    public queue: [string, string][] = []; // Array storing message and its callback character string
    public queueCallbackChars: Record<string, Function[]> = {}; // Maps callback character strings to an array of associated callbacks
    private _queueLock: boolean = false; // Boolean indicating if the queue is currently locked
    private queueLockDate: number | null = null; // Timestamp for when the queue lock was set, used to manage lock duration

    constructor(private connection: Connection) {
        // Initialize queue check to process items periodically
        this.startQueueCheck();
    }

    // Getter for queue lock status
    public get queueLock() {
        return this._queueLock;
    }

    // Setter for queue lock status
    public set queueLock(value: boolean) {
        // console.log('MessageQueue setting queueLock to:', value);
        this._queueLock = value;
        this.queueLockDate = value ? Date.now() : null; // Set the lock timestamp when locking the queue
    }

    // Retrieve all callback keys currently in queueCallbackChars
    public getCallbackKeys(): string[] {
        return Object.keys(this.queueCallbackChars);
    }

    // Retrieve all callbacks associated with a given callback key
    public getCallbacksForKey(callbackKey: string): Function[] {
        return this.queueCallbackChars[callbackKey] || [];
    }

    // Remove a specific callback for a given callback key
    public removeCallbackForKey(callbackKey: string, callback: Function) {
        if (this.queueCallbackChars[callbackKey]) {
            // Filter out the specified callback from the array
            this.queueCallbackChars[callbackKey] = this.queueCallbackChars[callbackKey].filter(cb => cb !== callback);

            // If no more callbacks exist for the key, delete the key
            if (this.queueCallbackChars[callbackKey].length === 0) {
                delete this.queueCallbackChars[callbackKey];
            }
        }
    }

    // Periodically checks and processes queue if it is not locked
    private startQueueCheck() {
        setInterval(() => {
            const lastWrite = this.connection.lastWrite;
            const lastMessageReceived = this.connection.lastMessageReceived;

            // // console.log('In startQueueCheck', this.connection.isConnected(), this.queue.length, this._queueLock, lastWrite, lastMessageReceived);

            // If no message has been received within 60 seconds of the last write, clear the queue
            if (
                lastWrite !== null &&
                lastMessageReceived !== null &&
                lastWrite - lastMessageReceived > 60 * 1000
            ) {
                // console.log('Connection no longer active, clearing queue');
                this.connection.setConnectionReady(false);
                this.clearQueue();
                return;
            }

            // If queue lock duration exceeds 5 seconds, release the lock
            if (this.queueLock && this.queueLockDate && Date.now() - this.queueLockDate > 5000) {
                this.queueLock = false;
            }

            // Process the next item in the queue if there are items and the queue is not locked
            if (this.queue.length > 0 && !this.queueLock) {
                this.processQueue();
            }
        }, 50); // Check every 50ms
    }

    // Processes the first item in the queue
    private async processQueue() {
        // console.log('Processing queue', this.queue.length, this.queueLock);
        if (this.queue.length === 0 || this.queueLock) return;

        // Retrieve the message and callback characters from the first queue item
        let [message, _callbackChars] = this.queue[0];

        // If the message does not start with "?" or "!", remove it from the queue immediately
        if (!message.startsWith("?") && !message.startsWith("!")) {
            this.queue.shift();
        } else {
            // For "!" or "?" messages, apply queue lock and remove the "!" prefix if present
            this.queueLock = true;
            if (message.startsWith("!")) {
                message = message.substring(1);
            }
        }

        // Enforce a delay between messages if the last write was recent
        if (Date.now() - (this.connection.lastWrite ?? 0) < 38) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Send the message directly via connection
        this.connection.directSend(message);
    }

    // Adds a message to the queue with optional callback characters and callback function
    public enqueue(message: string, callbackChars?: string, callback?: Function) {
        // console.log('Enqueuing message:', message);

        // Ensure the message is not already in the queue, then add it with callback characters if provided
        if (callbackChars && callbackChars !== '!none' && callback && !this.queue.some(q => q[0] === message)) {
            this.queue.push([message, callbackChars]);

            // If this is the first callback for these characters, create an entry
            if (!this.queueCallbackChars[callbackChars]) {
                this.queueCallbackChars[callbackChars] = [];
            }
            this.queueCallbackChars[callbackChars].push(callback);
        } else {
            // Add to queue without callback characters
            this.queue.push([message, '!none']);
        }
    }

    // Clears the entire queue, including all callbacks and resets the queue lock
    public clearQueue() {
        // console.log('Clearing the queue');
        this.queue = [];
        this.queueCallbackChars = {};
        this.queueLock = false;
        this.queueLockDate = null; // Reset lock date when clearing the queue
    }
}
