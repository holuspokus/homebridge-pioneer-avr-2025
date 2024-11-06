// src/telnet-avr/messageQueue.ts

export class MessageQueue {
    private log: any;
    private queue: [string, string][] = []; // [message, callbackChars]
    private queueCallbackChars: Record<string, Function[]> = {};
    private connection: Connection;
    private clearQueueTimeout: NodeJS.Timeout | null = null;
    private checkQueueInterval: NodeJS.Timeout | null = null;
    private queueLock: boolean = false;
    private queueLockDate: number | null = null;

    constructor(connection: Connection, private log: any) {
        this.log = log;
        this.connection = connection;
        this.startQueueCheck();
    }

    private startQueueCheck() {
        this.checkQueueInterval = setInterval(() => {
            if (!this.connection.connectionReady || !this.connection.lastWrite ||
                this.connection.lastWrite - this.connection.lastMessageReceived! > 60 * 1000) {
                this.connection.setConnectionReady(false);
                this.clearQueue();
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
        if (this.connection.connectionReady) {
            this.queueLock = true;
            this.queueLockDate = Date.now();
            this.connection.sendMessage(message, callbackChars, (err: any, result: string) => {
                this.queueLock = false;
                this.connection.setLastWrite(Date.now());
                this.queue.shift();

                if (this.queueCallbackChars[callbackChars]) {
                    for (const callback of this.queueCallbackChars[callbackChars]) {
                        callback(err, result);
                    }
                    delete this.queueCallbackChars[callbackChars];
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
}
