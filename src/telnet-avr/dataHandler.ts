// src/telnet-avr/dataHandler.ts

import type { TelnetAvr } from './telnetAvr';
import displayChars from './displayChars';
import type { MessageQueue } from './messageQueue';

class DataHandler {
    private telnetAvr: TelnetAvr; // Reference to TelnetAvr instance for managing Telnet operations
    public log: any; // Logger instance for logging debug/error messages
    private _lastMessageReceived: number | null = null; // Timestamp of the last message received

    constructor(
        telnetAvr: TelnetAvr,
        private messageQueue: MessageQueue,
    ) {
        this.telnetAvr = telnetAvr;
        this.log = telnetAvr.log;
    }

    /**
     * Getter for the timestamp of the last message received.
     * @returns {number | null} - The timestamp of the last message.
     */
    get lastMessageReceived(): number | null {
        return this._lastMessageReceived;
    }

    /**
     * Setter for the timestamp of the last message received.
     * @param value - The timestamp to set.
     */
    set lastMessageReceived(value: number | null) {
        this._lastMessageReceived = value;
    }

    /**
     * Handles incoming Telnet data, processes display characters, manages callbacks, and unlocks queue locks.
     * @param data - Incoming data buffer from the Telnet connection.
     */
    handleData(data: Buffer) {
        try {
            // Split the received data into lines and trim whitespace.
            const lines = data
                .toString()
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
            this.log.debug('telnet data>', data.toString().trim());

            // Update the timestamp of the last received message.
            this._lastMessageReceived = Date.now();
            this.telnetAvr.connection.setConnectionReady(true);

            let callbackCalled = false;

            for (const d of lines) {
                // Process 'FL' (display) messages.
                if (d.startsWith('FL')) {
                    const displayedMessage = d.substr(2).trim().match(/(..?)/g);
                    let outMessage = '';

                    // Translate each character code into readable display characters.
                    for (let pair of displayedMessage ?? []) {
                        pair = String(pair).toLowerCase();
                        outMessage += displayChars[pair] || '';
                    }
                    outMessage = outMessage.trim();
                    this.displayChanged(outMessage);
                    continue;
                }

                if (d.startsWith('E')) {
                    // Clear the queue entry if a queue lock exists.
                    const firstQueueEntry = this.messageQueue.queue[0];
                    if (firstQueueEntry) {
                        const [_, callbackChars] = firstQueueEntry;
                        const callbacks =
                            this.messageQueue.getCallbacksForKey(callbackChars);

                        for (const callback of callbacks) {
                            if (typeof callback === 'function') {
                                try {
                                    // Execute the matched callback with the received data.
                                    this.fallbackOnData(
                                        null,
                                        d + callbackChars,
                                        callback,
                                    );
                                    callbackCalled = true;
                                } catch (error) {
                                    this.log.error(error);
                                }
                            }
                        }

                        // Unlock the callback key after processing its callbacks.
                        this.messageQueue.removeCallbackForKey(callbackChars);
                        this.clearQueueEntry(callbackChars);
                    }
                } else {
                    // Process callbacks based on callback keys in the queue.
                    const callbackKeys = this.messageQueue.getCallbackKeys();
                    for (const callbackKey of callbackKeys) {
                        if (d.includes(callbackKey) || callbackKey == '!none') {
                            const callbacks =
                                this.messageQueue.getCallbacksForKey(
                                    callbackKey,
                                );

                            for (const callback of callbacks) {
                                if (typeof callback === 'function') {
                                    try {
                                        // Execute the matched callback with the received data.
                                        this.fallbackOnData(null, d, callback);
                                        callbackCalled = true;
                                    } catch (error) {
                                        this.log.error(error);
                                    }
                                }
                            }

                            // Unlock the callback key after processing its callbacks.
                            this.messageQueue.removeCallbackForKey(callbackKey);
                            this.clearQueueEntry(callbackKey);
                        }
                    }
                }

                // Handle unrecognized or unmatched messages.
                if (
                    !callbackCalled &&
                    !d.startsWith('FL') &&
                    !d.startsWith('R') &&
                    !d.startsWith('ST') &&
                    ![
                        'RGC',
                        'RGD',
                        'GBH',
                        'GHH',
                        'VTA',
                        'AUA',
                        'AUB',
                        'GEH',
                        'STM',
                        'STO',
                    ].includes(d.substr(0, 3))
                ) {
                    // Fallback handling for unrecognized messages.
                    this.fallbackOnData(null, d);
                }
            }
        } catch (error) {
            this.log.error(error);
        }
    }

    /**
     * Removes the first entry from the queue and unlocks the corresponding callback lock.
     * Optionally, it clears specific callbacks if a callbackKey is provided.
     * @param callbackKey - The specific callback key to clear, if applicable
     */
    private clearQueueEntry(callbackKey?: string) {
        // Remove the first item in the queue to allow processing of the next item.
        this.messageQueue.queue.shift();

        // If a specific callback key is provided, unlock its callback lock.
        if (callbackKey && this.messageQueue.callbackLocks[callbackKey]) {
            this.messageQueue.callbackLocks[callbackKey].queueLock = false;
            this.messageQueue.callbackLocks[callbackKey].queueLockDate = null;

            // If no more callbacks exist for the key, delete the key.
            delete this.messageQueue.queueCallbackChars[callbackKey];
            delete this.messageQueue.callbackLocks[callbackKey];
        }
    }

    /**
     * Updates the display via the TelnetAvr instance when a display change is detected.
     * @param message - The display message to update.
     */
    public displayChanged(message: string) {
        this.telnetAvr.displayChanged(message);
    }

    /**
     * Fallback handler for unmatched data, which logs or processes unexpected messages.
     * @param error - An error object, if applicable.
     * @param data - The received data string.
     * @param callback - An optional callback function to execute with the data.
     */
    public fallbackOnData(error: any, data: string, callback?: Function) {
        this.telnetAvr.fallbackOnData(error, data, callback);
    }
}

export default DataHandler;
