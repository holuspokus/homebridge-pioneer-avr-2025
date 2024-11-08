// src/telnet-avr/dataHandler.ts
import { TelnetAvr } from './telnetAvr';
import displayChars from './displayChars';
import { MessageQueue } from './messageQueue';

class DataHandler {
    private telnetAvr: TelnetAvr;
    // private messageQueue: MessageQueue;
    // private queueLock: boolean = false;
    private queueCallbackChars: { [key: string]: Function[] } = {};
    private queueQueries: any[] = [];
    private log: any;
    private _lastMessageReceived: number | null = null;

    constructor(telnetAvr: TelnetAvr, private messageQueue: MessageQueue) {
        this.telnetAvr = telnetAvr;
        // this.messageQueue = new MessageQueue(this.telnetAvr.connection, log);
        this.log = telnetAvr.log;
    }

    get queueLock() {
        return this.messageQueue.queueLock;
    }

    set queueLock(value: boolean) {
        this.messageQueue.queueLock = value;
    }

    // Getter for lastMessageReceived timestamp
    get lastMessageReceived(): number | null {
        return this._lastMessageReceived;
    }

    // Handles incoming data buffer and processes messages accordingly
    handleData(data: Buffer) {
        try {
            let d = data.toString().replace("\n", "").replace("\r", "").trim();
            let callbackCalled = false;
            this._lastMessageReceived = Date.now();

            if (d.startsWith("FL")) {
                const displayedMessage = d.substr(2).trim().match(/(..?)/g);
                let outMessage = "";

                // Iterates through matched pairs, retrieving display characters
                for (let pair of displayedMessage ?? []) {
                    pair = String(pair).toLowerCase();
                    outMessage += displayChars[pair] || "";
                }
                outMessage = outMessage.trim();
                d = "FL" + outMessage;  // Constructed display message

                this.displayChanged(outMessage);
            }

            // Checks for SEND message type and enqueues it for processing
            if (!callbackCalled && d.startsWith("SEND")) {
                const messageToSend = d.substring(5);
                this.messageQueue.enqueue(messageToSend, "callbackKey", () => {
                    // Handle response from send if needed
                });
            }

            // Processes queue if queue lock is active and queries exist
            if (this.queueLock && this.queueQueries.length > 0) {
                const callbackKeys = Object.keys(this.queueCallbackChars);
                for (let callbackKey of callbackKeys) {
                    if (d.indexOf(callbackKey) > -1) {
                        for (let runThis of this.queueCallbackChars[callbackKey]) {
                            if (typeof runThis === "function") {
                                try {
                                    runThis(null, d);
                                    callbackCalled = true;
                                } catch (e) {
                                    this.log.error(e);
                                }
                            }
                            this.queueCallbackChars[callbackKey] = this.queueCallbackChars[callbackKey].filter(cb => cb !== runThis);
                            this.queueQueries = this.queueQueries.filter(q => q !== this.queueQueries[0]);
                            this.queueLock = false;
                        }
                    }
                }
            }

            // Fallback handling for unrecognized message types
            if (!callbackCalled && !d.startsWith("FL") && !d.startsWith("R") &&
                !d.startsWith("ST") && !["RGC", "RGD", "GBH", "GHH", "VTA", "AUA", "AUB", "GEH"].includes(d.substr(0, 3))) {
                this.fallbackOnData(null, d);
            }
        } catch (e) {
            this.log.error(e);
        }
    }

    // Handles display updates by delegating to telnetAvr instance
    public displayChanged(message: string) {
        this.telnetAvr.displayChanged(message);
    }

    // Fallback handler for data processing when no specific handler is matched
    public fallbackOnData(error: any, data: string, callback?: Function) {
        this.telnetAvr.fallbackOnData(error, data, callback);
    }
}

export default DataHandler;
