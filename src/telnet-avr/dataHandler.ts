// src/telnet-avr/dataHandler.ts

import { TelnetAvr } from './telnetAvr';
import displayChars from './displayChars';
import { MessageQueue } from './messageQueue';

class DataHandler {
    private telnetAvr: TelnetAvr; // Reference to TelnetAvr instance for handling telnet operations
    public log: any; // Logger instance for logging debug/error messages
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

    // Setter for the last message received timestamp
    set lastMessageReceived(value: number | null) {
        this._lastMessageReceived = value;
    }

    /**
     * Handles incoming data buffer, processes display characters, and manages callback handling.
     * @param data - The incoming data buffer to process
     */
     handleData(data: Buffer) {
         try {
             // Convert buffer to string and split it into lines by newline characters.
             // This ensures that each line in the received data can be processed individually.
             const lines = data.toString().split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

             // Debug log for the entire received data
             this.log.debug('telnet data>', data.toString().trim());

             let callbackCalled = false;

             // Update the timestamp for the last received message
             this._lastMessageReceived = Date.now();
             this.telnetAvr.connection.setConnectionReady(true);

             // Process each line individually
             for (const d of lines) {
                 // this.log.debug('telnet data (line)>', d);

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
                     const formattedMessage = "FL" + outMessage;

                     // Log and handle the translated display message
                     // this.log.debug('display>', formattedMessage);
                     this.displayChanged(outMessage);
                     continue; // Skip further processing for display messages
                 }

                 // Handle queue-locked messages
                 if (this.queueLock) {
                     // Handle error messages starting with "E"
                     if (d.startsWith("E")) {
                         const callbackKey = this.messageQueue.queue[0]?.[1];
                         if (Object.keys(this.messageQueue.queueCallbackChars).includes(callbackKey)) {
                             for (const runThis of this.messageQueue.getCallbacksForKey(callbackKey)) {
                                 if (typeof runThis === "function") {
                                     try {
                                         this.fallbackOnData(null, d + callbackKey, runThis);
                                         callbackCalled = true;
                                     } catch (e) {
                                         this.log.error(e);
                                     }
                                 }
                                 // Remove callback and clear queue entry
                                 this.messageQueue.removeCallbackForKey(callbackKey, runThis);
                                 this.clearQueueEntry(callbackKey);
                             }
                         }
                     } else {
                         // Check for other callbacks based on keys
                         const callbackKeys = this.messageQueue.getCallbackKeys();
                         for (const callbackKey of callbackKeys) {
                             if (d.includes(callbackKey)) {
                                 for (const runThis of this.messageQueue.getCallbacksForKey(callbackKey)) {
                                     if (typeof runThis === "function") {
                                         try {
                                             this.fallbackOnData(null, d, runThis);
                                             callbackCalled = true;
                                         } catch (e) {
                                             this.log.error(e);
                                         }
                                     }
                                     // Remove executed callback and clear queue entry
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
             }
         } catch (e) {
             // Log any errors encountered during processing
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
