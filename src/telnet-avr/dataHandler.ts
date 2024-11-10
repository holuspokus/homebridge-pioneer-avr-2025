// src/telnet-avr/dataHandler.ts

import { TelnetAvr } from './telnetAvr';
import displayChars from './displayChars';
import { MessageQueue } from './messageQueue';

class DataHandler {
    private telnetAvr: TelnetAvr; // Reference to TelnetAvr instance for handling telnet operations
    private log: any; // Logger instance for logging debug/error messages
    private _lastMessageReceived: number | null = null; // Timestamp of the last message received

    constructor(telnetAvr: TelnetAvr, private messageQueue: MessageQueue) {
        this.telnetAvr = telnetAvr;
        this.log = telnetAvr.log;
    }

    // Getter and setter for queueLock, using the MessageQueue's queueLock property
    get queueLock() {
        return this.messageQueue.queueLock;
    }

    set queueLock(value: boolean) {
        // console.log('DataHandler setting queueLock to:', value);
        this.messageQueue.queueLock = value;
    }

    // Getter for the last message received timestamp
    get lastMessageReceived(): number | null {
        return this._lastMessageReceived;
    }

    /**
     * Handles incoming data buffer, processes display characters, and manages callback handling.
     * @param data - The incoming data buffer to process
     */
    handleData(data: Buffer) {
        try {
            // Convert buffer to string and clean it by removing new lines and carriage returns
            let d = data.toString().replace("\n", "").replace("\r", "").trim();
            // this.log.debug('telnet data>', d);

            let callbackCalled = false;
            this._lastMessageReceived = Date.now(); // Update the last message received timestamp

            // Process display messages (starting with "FL")
            if (d.startsWith("FL")) {
                const displayedMessage = d.substr(2).trim().match(/(..?)/g);
                let outMessage = "";

                // Translate each character code to readable display characters
                for (let pair of displayedMessage ?? []) {
                    pair = String(pair).toLowerCase();
                    outMessage += displayChars[pair] || "";
                }
                outMessage = outMessage.trim();
                d = "FL" + outMessage;

                // Display the translated message
                this.displayChanged(outMessage);
            }

            // Check if queueLock is active and handle callbacks or error responses
            if (this.queueLock) {
                // Handle error messages starting with "E" and clear the queue entry if an error occurs
                if (d.startsWith("E") ) {
                      // Process callback messages by checking if they contain expected callback keys
                      const callbackKey = this.messageQueue.queue[0][1]

                      if(Object.keys(this.messageQueue.queueCallbackChars).indexOf(callbackKey) > -1){
                        // Run each callback function for the matched callback key
                        for (let runThis of this.messageQueue.getCallbacksForKey(callbackKey)) {
                            if (typeof runThis === "function") {
                                try {
                                    this.fallbackOnData(null, d + callbackKey, runThis);
                                    callbackCalled = true;
                                } catch (e) {
                                    this.log.error(e);
                                }
                            }
                            // Remove the executed callback and clear the queue entry
                            this.messageQueue.removeCallbackForKey(callbackKey, runThis);
                            this.clearQueueEntry(callbackKey);
                        }
                    }
                } else {
                    // Process callback messages by checking if they contain expected callback keys
                    const callbackKeys = this.messageQueue.getCallbackKeys();
                    for (let callbackKey of callbackKeys) {
                        if (d.includes(callbackKey)) {
                            // Run each callback function for the matched callback key
                            for (let runThis of this.messageQueue.getCallbacksForKey(callbackKey)) {
                                if (typeof runThis === "function") {
                                    try {
                                        this.fallbackOnData(null, d, runThis);
                                        callbackCalled = true;
                                    } catch (e) {
                                        this.log.error(e);
                                    }
                                }
                                // Remove the executed callback and clear the queue entry
                                this.messageQueue.removeCallbackForKey(callbackKey, runThis);
                                this.clearQueueEntry(callbackKey);
                            }
                        }
                    }
                }
            }

            // Handle unrecognized messages by passing them to the fallback handler
            if (!callbackCalled && !d.startsWith("FL") && !d.startsWith("R") &&
                !d.startsWith("ST") && !["RGC", "RGD", "GBH", "GHH", "VTA", "AUA", "AUB", "GEH"].includes(d.substr(0, 3))) {
                this.fallbackOnData(null, d);

                if (this.queueLock) {
                    this.clearQueueEntry();
                }
            }
        } catch (e) {
            this.log.error(e);
        }
    }

    /**
     * Removes the first entry from the queue and resets queueLock.
     * Optionally, it clears specific callbacks if a callbackKey is provided.
     * @param callbackKey - The specific callback key to clear, if applicable
     */
    private clearQueueEntry(callbackKey?: string) {
        // Remove the first item in the queue to allow processing of the next item
        this.messageQueue.queue.shift();

        // If a specific callback key is provided, delete all associated callbacks
        if (callbackKey) {
            delete this.messageQueue.queueCallbackChars[callbackKey];
        }

        // Reset queue lock to allow further processing
        this.queueLock = false;
    }

    /**
     * Updates the display on the TelnetAvr instance.
     * @param message - The message to display
     */
    public displayChanged(message: string) {
        this.telnetAvr.displayChanged(message);
    }

    /**
     * Fallback handler for data processing when no specific callback is matched.
     * Passes the error and data to the TelnetAvr instance.
     * @param error - Error encountered, if any
     * @param data - Data received
     * @param callback - Optional callback function to execute with the data
     */
    public fallbackOnData(error: any, data: string, callback?: Function) {
        this.telnetAvr.fallbackOnData(error, data, callback);
    }
}

export default DataHandler;
