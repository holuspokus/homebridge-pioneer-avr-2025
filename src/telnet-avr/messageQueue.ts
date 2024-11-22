// src/telnet-avr/messageQueue.ts

import { Connection } from "./connection";

export class MessageQueue {
    public queue: [string, string][] = []; // Array storing message and its callback character string
    public queueCallbackChars: Record<string, Function[]> = {}; // Maps callback character strings to an array of associated callbacks
    public callbackLocks: Record<string, { queueLock: boolean; queueLockDate: number | null }> = {}; // Locks specific to callback characters

    constructor(private connection: Connection) {
        // Start periodic queue checking
        this.startQueueCheck();
    }

    /**
     * Starts periodic checking and processing of the queue.
     * Releases locks and processes messages as needed.
     */
    private startQueueCheck() {
        setInterval(() => {
            // Process the next item in the queue if it is not locked
            if (this.queue.length > 0) {

                // Unlock callbackLocks if they are active for more than 5 seconds
                for (const key of Object.keys(this.callbackLocks)) {
                    const lock = this.callbackLocks[key];
                    if (lock.queueLock && lock.queueLockDate && Date.now() - lock.queueLockDate > 15000) {
                        delete this.callbackLocks[key];
                    }
                }

                this.processQueue();
            }
        }, 7); // Check every 17ms
    }

    /**
     * Processes the first item in the queue, sending the message if not locked.
     */
    public async processQueue() {
        if (this.queue.length === 0) return;

        const [message, callbackKey] = this.queue[0];

        // Skip processing if the lock for the callback key is active
        const lock = this.callbackLocks[callbackKey];
        if (lock?.queueLock) return;

        // Lock the callback key before sending the message
        if (!this.callbackLocks[callbackKey]) {
            this.callbackLocks[callbackKey] = { queueLock: true, queueLockDate: Date.now() };
        } else {
            this.callbackLocks[callbackKey].queueLock = true;
            this.callbackLocks[callbackKey].queueLockDate = Date.now();
        }

        // Enforce a delay between messages if necessary
        if (Date.now() - (this.connection.lastWrite ?? 0) < 17) {
            await new Promise(resolve => setTimeout(resolve, 7));
        }

        // Send the message via the connection
        this.connection.directSend(message);
    }

    /**
     * Adds a message to the queue with optional callback characters and a callback function.
     * @param message - The message to send
     * @param callbackChars - The callback character string to track
     * @param callback - The function to execute when the response is received
     */
    public enqueue(message: string, callbackChars?: string, callback?: Function) {
        if (!callbackChars){
            callbackChars = '!none'
        }

        // Add the message to the queue if not already present
        if (!this.queue.some(q => q[0] === message)) {
            this.queue.push([message, callbackChars]);
        }

        if(callback){
            // Add the callback to the list of callbacks for the callback character string
            if (!this.queueCallbackChars[callbackChars]) {
                this.queueCallbackChars[callbackChars] = [];
            }
            this.queueCallbackChars[callbackChars].push(callback);
        }
    }

    /**
     * Clears the entire queue and resets all locks and callbacks.
     */
    public clearQueue() {
        this.queue = [];
        this.queueCallbackChars = {};
        this.callbackLocks = {};
    }

    /**
     * Removes all callbacks associated with a specific callback character key.
     * @param callbackKey - The callback key to clear
     * @param callback - The specific callback to remove
     */
    public removeCallbackForKey(callbackKey: string) {
        if (this.queueCallbackChars[callbackKey]) {

            // If no more callbacks exist for the key, delete the key
            delete this.queueCallbackChars[callbackKey];
        }

        if (this.callbackLocks[callbackKey]) {
            this.callbackLocks[callbackKey].queueLock = false;
            this.callbackLocks[callbackKey].queueLockDate = null;
        }
    }

    /**
     * Retrieves all callback keys currently in the queueCallbackChars map.
     * @returns {string[]} - An array of callback keys
     */
    public getCallbackKeys(): string[] {
        return Object.keys(this.queueCallbackChars);
    }

    /**
     * Retrieves all callbacks associated with a specific callback key.
     * @param callbackKey - The key to retrieve callbacks for
     * @returns {Function[]} - An array of callbacks
     */
    public getCallbacksForKey(callbackKey: string): Function[] {
        return this.queueCallbackChars[callbackKey] || [];
    }
}
