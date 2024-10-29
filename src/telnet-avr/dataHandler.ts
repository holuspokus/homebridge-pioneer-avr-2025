// src/telnet-avr/dataHandler.ts

import TelnetAvr from './TelnetAvr';
import displayChars from './displayChars'; // Import display characters
import { MessageQueue } from './messageQueue'; // Import MessageQueue

class DataHandler {
    private telnetAvr: TelnetAvr;
    private messageQueue: MessageQueue; // New instance of MessageQueue
    private lastMessageReceived: number;
    private queueLock: boolean = false;
    private queueCallbackChars: { [key: string]: Function[] } = {};
    private queueQueries: any[] = [];
    private display: string;

    constructor(telnetAvr: TelnetAvr) {
        this.telnetAvr = telnetAvr;
        this.messageQueue = new MessageQueue(this.telnetAvr.connection.sendMessage.bind(this.telnetAvr.connection)); // Pass the sendMessage method
    }

    handleData(data: Buffer) {
        try {
            const d = data.toString().replace("\n", "").replace("\r", "").trim();
            let callbackCalled = false;
            this.lastMessageReceived = Date.now();
            
            if (d.startsWith("FL")) {
                // Message displayed
                let displayedMessage = d.substr(2).trim().match(/(..?)/g);
                let outMessage = "";
                for (let pair of displayedMessage) {
                    pair = String(pair).toLowerCase();
                    outMessage += displayChars[pair] || "";
                }
                outMessage = outMessage.trim();
                d = "FL" + outMessage;
                this.display = outMessage;

                this.displayChanged(null, outMessage);
            }

            // Use the queue to send messages
            if (!callbackCalled && d.startsWith("SEND")) {
                const messageToSend = d.substring(5); // Extract the message
                this.messageQueue.enqueue(messageToSend, "callbackKey", (err, result) => {
                    // Handle response from send
                });
            }

            // Check callback logic
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
                                    console.error(e);
                                }
                            }
                            this.queueCallbackChars[callbackKey] = this.queueCallbackChars[callbackKey].filter(cb => cb !== runThis);
                            this.queueQueries = this.queueQueries.filter(q => q !== this.queueQueries[0]); // Remove processed query
                            this.queueLock = false;
                        }
                    }
                }
            }

            if (!callbackCalled && !d.startsWith("FL") && !d.startsWith("R") &&
                !d.startsWith("ST") && !["RGC", "RGD", "GBH", "GHH", "VTA", "AUA", "AUB", "GEH"].includes(d.substr(0, 3))) {
                this.fallbackOnData(null, d);
            }
        } catch (e) {
            console.error(e);
        }
    }

    public displayChanged(error: any, message: string) {
        // Implement your logic for display change
    }

    public fallbackOnData(error: any, data: string) {
        // Implement your logic for fallback
    }
}

export default DataHandler;
