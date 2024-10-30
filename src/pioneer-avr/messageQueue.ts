// src/telnet-avr/messageQueue.ts

export class MessageQueue {
    private queue: [string, string][] = []; // [message, callbackChars]
    private queueCallbackChars: Record<string, Function[]> = {};
    private lastWrite: number | null = null;
    private lastMessageReceived: number | null = null;
    private connectionReady: boolean = false;
    private sendMessage: (message: string, callbackChars?: string, onData?: Function) => void;
    private clearQueueTimeout: NodeJS.Timeout | null = null;
    private checkQueueInterval: NodeJS.Timeout | null = null;
    private queueLock: boolean = false;
    private queueLockDate: number | null = null;

    constructor(sendMessage: (message: string, callbackChars?: string, onData?: Function) => void) {
        this.sendMessage = sendMessage;
        this.startQueueCheck();
    }

    private startQueueCheck() {
        this.checkQueueInterval = setInterval(() => {
            if (!this.connectionReady || !this.lastWrite || this.lastWrite - this.lastMessageReceived! > 60 * 1000) {
                this.connectionReady = false;
                this.clearQueue();
                // Handle disconnect logic if needed
                return;
            }

            if (this.queue.length > 0 && !this.queueLock) {
                this.processQueue();
            }
        }, 50);
    }

    private processQueue() {
        if (this.queue.length === 0 || this.queueLock) return;

        const [message, callbackChars] = this.queue[0];
        if (this.connectionReady) {
            this.queueLock = true;
            this.queueLockDate = Date.now();
            this.sendMessage(message, callbackChars, (err: any, result: string) => {
                this.queueLock = false;
                this.lastWrite = Date.now();
                this.queue.shift(); // Remove processed message from queue

                if (this.queueCallbackChars[callbackChars]) {
                    for (const callback of this.queueCallbackChars[callbackChars]) {
                        callback(err, result);
                    }
                    delete this.queueCallbackChars[callbackChars]; // Clear callbacks for this message
                }
            });
        }
    }

    public enqueue(message: string, callbackChars: string, onData: Function) {
        if (!this.queue.some(q => q[0] === message)) {
            this.queue.push([message, callbackChars]);
            if (!this.queueCallbackChars[callbackChars]) {
                this.queueCallbackChars[callbackChars] = [];
            }
            this.queueCallbackChars[callbackChars].push(onData);
        }
    }

    public clearQueue() {
        this.queue = [];
        this.queueCallbackChars = {};
    }

    public setConnectionReady(ready: boolean) {
        this.connectionReady = ready;
    }

    public setLastWrite(timestamp: number) {
        this.lastWrite = timestamp;
    }

    public setLastMessageReceived(timestamp: number) {
        this.lastMessageReceived = timestamp;
    }
}
