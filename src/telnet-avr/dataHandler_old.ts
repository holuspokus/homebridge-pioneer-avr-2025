// src/telnet-avr/dataHandler.ts

import TelnetAvr from './TelnetAvr';
import displayChars from './displayChars'; // Importiere die displayChars
import { MessageQueue } from './messageQueue'; // Importiere die MessageQueue

class DataHandler {
    private telnetAvr: TelnetAvr;
    private messageQueue: MessageQueue; // Neue Instanz der MessageQueue
    private lastMessageReceived: number;
    private queueLock: boolean = false;
    private queueCallbackChars: { [key: string]: Function[] } = {};
    private queueQueries: any[] = [];
    private display: string;

    constructor(telnetAvr: TelnetAvr) {
        this.telnetAvr = telnetAvr;
        this.messageQueue = new MessageQueue(this.telnetAvr.sendMessage.bind(this.telnetAvr)); // Übergebe die sendMessage-Methode
    }

    handleData(data: Buffer) {
        const d = data.toString().replace("\n", "").replace("\r", "").trim();
        let callbackCalled = false;
        this.lastMessageReceived = Date.now();

        try {
            let data = d
                .toString()
                .replace("\n", "")
                .replace("\r", "")
                .trim();

            if (data.startsWith("FL")) {
                // message on display
                let displayedMessage = data
                    .substr(2)
                    .trim()
                    .match(/(..?)/g);

                let displayCharsKeys = Object.keys(displayChars);
                let outMessage = "";
                for (let pair of displayedMessage) {
                    pair = String(pair).toLowerCase();
                    if (displayCharsKeys.includes(pair)) {
                        outMessage += displayChars[pair];
                    }
                }
                outMessage = outMessage.trim();
                data = "FL" + outMessage;

                this.display = outMessage;

                try {
                    this.displayChanged(null, outMessage);
                } catch (e) {
                    console.log("[DISPLAY] " + outMessage);
                    console.error(e);
                }
            }

            // Hier können wir die Warteschlange nutzen, um Nachrichten zu senden
            if (!callbackCalled && data.startsWith("SEND")) {
                const messageToSend = data.substring(5); // Extrahiere die Nachricht
                this.messageQueue.enqueue(messageToSend); // Füge die Nachricht zur Warteschlange hinzu
            }

            if (this.queueLock === true && this.queue.length > 0) {
                let callbackKeys = Object.keys(this.queueCallbackChars);
                for (let callbackKey of callbackKeys) {
                    if (data.indexOf(callbackKey) > -1) {
                        for (let runThis of this.queueCallbackChars[callbackKey]) {
                            if (typeof runThis === "function") {
                                try {
                                    let runThisThis = runThis.bind({});
                                    runThisThis(null, data);
                                    callbackCalled = true;
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                            this.queueCallbackChars[callbackKey] = this.queueCallbackChars[callbackKey].filter(cb => cb !== runThis);
                            this.queue = this.queue.filter((q) => {
                                if (q[1] === callbackKey) {
                                    this.queueQueries.splice(this.queueQueries.indexOf(q[0]), 1);
                                    this.queueLock = false;
                                    return false; // Remove this item from the queue
                                }
                                return true; // Keep this item in the queue
                            });
                        }
                    }
                }

                if (!callbackCalled && this.queueLock !== false && data.startsWith("E")) {
                    let thisCallbackKey = this.queue[0][1];
                    if (this.queueCallbackChars[thisCallbackKey]) {
                        for (let runThis of this.queueCallbackChars[thisCallbackKey]) {
                            if (typeof runThis === "function") {
                                try {
                                    let runThisThis = runThis.bind({});
                                    runThisThis(null, data + thisCallbackKey);
                                    callbackCalled = true;
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                            this.queueCallbackChars[thisCallbackKey] = this.queueCallbackChars[thisCallbackKey].filter(cb => cb !== runThis);
                            this.queue = this.queue.filter((q) => {
                                if (q[1] === thisCallbackKey) {
                                    this.queueQueries.splice(this.queueQueries.indexOf(q[0]), 1);
                                    this.queueLock = false;
                                    return false; // Remove this item from the queue
                                }
                                return true; // Keep this item in the queue
                            });
                        }
                    }
                }
            }

            if (!callbackCalled && !data.startsWith("FL") && !data.startsWith("R") &&
                !data.startsWith("ST") && !["RGC", "RGD", "GBH", "GHH", "VTA", "AUA", "AUB", "GEH"].includes(data.substr(0, 3))) {
                try {
                    this.fallbackOnData(null, data);
                } catch (e) {
                    console.error(e);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    public displayChanged(error: any, message: string) {
        // Implementiere deine Logik für die Anzeigeänderung
    }

    public fallbackOnData(error: any, data: string) {
        // Implementiere deine Logik für den Fallback
    }
}

export default DataHandler;
