// src/telnet-avr/connection.ts

import net from 'net';
import type { TelnetAvr } from './telnetAvr';
import { MessageQueue } from './messageQueue';
import DataHandler from './dataHandler';
import { addExitHandler } from '../exitHandler';
import { findDevices } from '../discovery';

let onExitCalled = false;

export class Connection {
    private socket: net.Socket | null = null;
    private lastConnect: number | null = null;
    private messageQueue: MessageQueue;
    private connectionReady: boolean = false;
    public lastWrite: number | null = null;
    private clearQueueTimeout: NodeJS.Timeout | null = null;
    private disconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectCounter = 0;
    private isConnecting: number | null = null;
    private log: any;
    private discoveredDevices: any[] = [];
    private dataHandler: DataHandler;
    private host: string;
    private port: number;
    private avr: any;
    private maxReconnectAttemptsBeforeDiscover: number = 10;
    private maxReconnectAttempts: number = 1000;
    private isReconnect: boolean = false;
    private checkConnInterval!: NodeJS.Timeout;
    private reconnectTimeout!: NodeJS.Timeout;
    private reconnectCallbackTimeout!: NodeJS.Timeout;
    private device: any;

    constructor(telnetThis: TelnetAvr) {
        this.avr = telnetThis.avr;
        this.port = telnetThis.port;
        this.host = telnetThis.host;
        this.log = telnetThis.avr.log;
        this.device = telnetThis.device;
        this.discoveredDevices = telnetThis.platform.config.discoveredDevices ?? [];
        this.messageQueue = new MessageQueue(this);
        this.dataHandler = new DataHandler(telnetThis, this.messageQueue);

        // Set default values from config or use defaults
        this.maxReconnectAttemptsBeforeDiscover = parseInt(
          (telnetThis.platform.config.maxReconnectAttemptsBeforeDiscover ?? "10").toString(),
          10
        );
        this.maxReconnectAttempts = parseInt(
          (telnetThis.platform.config.maxReconnectAttempts ?? "1000").toString(),
          10
        );

        // Ensure maxReconnectAttemptsBeforeDiscover is at least 10 and at most 100
        if (this.maxReconnectAttemptsBeforeDiscover < 10) {
          this.maxReconnectAttemptsBeforeDiscover = 10;
        } else if (this.maxReconnectAttemptsBeforeDiscover > 100) {
          this.maxReconnectAttemptsBeforeDiscover = 100;
        }

        // Ensure maxReconnectAttempts is at least 100 and at most 1000
        if (this.maxReconnectAttempts < 100) {
          this.maxReconnectAttempts = 100;
        } else if (this.maxReconnectAttempts > 100000) {
          this.maxReconnectAttempts = 100000;
        }

        // Ensure maxReconnectAttempts is greater than maxReconnectAttemptsBeforeDiscover
        if (this.maxReconnectAttempts <= this.maxReconnectAttemptsBeforeDiscover) {
          // Increase maxReconnectAttempts to be at least one more than maxReconnectAttemptsBeforeDiscover
          this.maxReconnectAttempts = this.maxReconnectAttemptsBeforeDiscover + 10;
          // Also, ensure it meets the minimum threshold for maxReconnectAttempts
          if (this.maxReconnectAttempts < 100) {
            this.maxReconnectAttempts = 100;
          }
        }


        addExitHandler(this.disconnectOnExit.bind(this), this);

        setTimeout(() => {
            clearInterval(this.checkConnInterval);
            this.checkConnInterval = setInterval(() => {


                if (
                    this.connectionReady &&
                    this.reconnectCounter === 0 &&
                    this.lastWrite !== null &&
                    this.lastMessageReceived !== null &&
                    this.lastWrite - this.lastMessageReceived > 10000 &&
                    Date.now() - this.lastMessageReceived > 60 * 1000
                ) {
                    this.log.warn(
                        ` > Device ${this.avr.device.name} not responding.`,
                    );
                    this.connectionReady = false;
                    this.messageQueue.clearQueue();
                    this.disconnect();
                    this.connect();
                    this.isConnecting = Date.now();
                }
            }, 3107);
        }, 5000);
    }

    private disconnectOnExit() {
        onExitCalled = true;

        if (this.checkConnInterval) {
            clearInterval(this.checkConnInterval);
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.reconnectCallbackTimeout) {
            clearTimeout(this.reconnectCallbackTimeout);
        }

        if (this.connectionReady) {
            this.connectionReady = false;
            this.disconnect();
        }
    }

    connect(callback: () => void = () => {}) {
        if (
            !this.connectionReady &&
            this.isConnecting !== null &&
            Date.now() - this.isConnecting < 30000
        ) {
            setTimeout(callback, 1500);
            return;
        }

        // this.log.debug('connect() called');

        if (this.socket) {
            if (
                !this.connectionReady &&
                Date.now() - (this.lastConnect ?? 0) > 15 * 1000
            ) {
                this.reconnect(callback);
            } else if (this.connectionReady) {
                this.log.debug('Already connected, delaying callback.');
                setTimeout(callback, 1500);
            } else {
                try {
                    callback();
                } catch (e) {
                    this.log.error('Connect callback error:', e);
                }
            }
        } else {
            // if (!this.socket) {
            this.initializeSocket(callback);
        }
    }

    private initializeSocket(callback: () => void) {
        // this.log.debug('initializeSocket() called');
        this.isConnecting = Date.now();
        this.socket = new net.Socket();
        this.socket.setTimeout(30 * 1000);

        this.socket.removeAllListeners('connect');

        this.socket.on('connect', () => {
            if (onExitCalled || !this.socket) {
                return;
            }
            if (this.socket.destroyed) {
                return;
            }
            if (this.socket.connecting || this.socket.readyState !== 'open') {
                return;
            }

            this.reconnectCounter = 0;
            this.lastMessageReceived = null;
            this.setConnectionReady(true);
            this.lastConnect = Date.now();
            this.log.debug('Socket connected.');

            this.sendMessage('?P', 'PWR', async () => {
                if (!this.isReconnect) {
                    try {
                        callback();
                    } catch (e) {
                        this.log.error(
                            'Connect initializeSocket callback error:',
                            e,
                        );
                    }
                    this.isReconnect = true;
                } else {
                    this.log.info(
                        '>> successfuly reconnected ' + this.avr.device.name,
                    );
                }

                try {
                    this.onConnect();
                } catch (e) {
                    this.log.error(
                        'Connect initializeSocket onConnect error:',
                        e,
                    );
                }
            });
        });

        this.socket.on('close', () => {
            this.handleClose();
        });
        this.socket.on('data', (data) => {
            this.handleData(data);
        });
        this.socket.on('error', (err) => {
            this.handleError(err);
        });

        this.socket.connect(this.port, this.host);
    }

    private handleClose() {
        this.isConnecting = null;
        this.setConnectionReady(false);

        if (onExitCalled) {
            return;
        }
        this.log.debug('Socket closed, attempting reconnect.');
        this.tryReconnect();
    }

    private handleData(data: Buffer) {
        this.dataHandler?.handleData(data);
    }

    private handleError(err: Error) {
        this.isConnecting = null;

        if (err.message.includes('CONN') || err.message.includes('EHOSTUNREACH') || err.message.includes('ENOTFOUND')) {
            this.setConnectionReady(false);
            this.onDisconnect();
        }

        if (this.reconnectCounter > 1) {
            this.log.debug('Connection error:', err);
        }else{
            this.log.error('Connection error:', err);
        }
    }

    private tryReconnect() {
        if (onExitCalled) {
            return;
        }

        this.reconnectCounter++;
        const delay = this.reconnectCounter > 30 ? 60 : 15;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if ( this.reconnectCounter >= ( this.maxReconnectAttempts * 2 ) ) {
            // process.exit(1);
            return;
        }

        this.reconnectTimeout = setTimeout(() => {
            if (onExitCalled || this.connectionReady) {
                return;
            }

            if (this.reconnectCounter > 1) {
                this.log.debug('Attempting reconnection...', this.reconnectCounter);
            }else{
                this.log.info('Attempting reconnection...');
            }
            this.connect();
        }, delay * 1000);
    }

    async reconnect(callback: () => void) {
        // this.log.debug('reconnect() called');

        if (onExitCalled || this.connectionReady || !this.socket) {
            return;
        }
        if (this.socket.connecting || this.socket.readyState === 'open') {
            try {
                callback();
            } catch (error) {
                this.log.debug('reconnect callback error', error);
            }
        }

        if ( this.reconnectCounter >= this.maxReconnectAttempts ) {
            if (this.reconnectCallbackTimeout) {
                clearTimeout(this.reconnectCallbackTimeout);
            }
            this.reconnectCallbackTimeout = setTimeout(() => {
                try {
                    callback();
                } catch (error) {
                    this.log.debug('reconnect callback error', error);
                }
            }, 1 * 24 * 60 * 60 * 1000);

            return;
        }
        if ( this.reconnectCounter >= ( this.maxReconnectAttempts * 2 ) ) {
            return;
        }


        if (
            this.reconnectCounter >= this.maxReconnectAttemptsBeforeDiscover &&
            this.avr.device.source == 'bonjour'
        ) {
            const devices = await findDevices(
                this.avr.device.origName,
                this.avr.platform.TELNET_PORTS || [23, 24, 8102],
                this.log,
                1,
            );

            if (devices.length > 0) {
                // First, filter devices matching by fqdn or host + origName of the current device
                const filteredDevices = devices.filter(device =>
                    (this.device.fqdn && device.fqdn === this.device.fqdn) || // Use fqdn as primary identifier
                    (device.host === this.device.host && device.origName === this.device.origName) // Fallback: host + origName match
                );

                let updatedDevice;

                // If no matching device is found, filter for new devices that are not already in discoveredDevices
                if (filteredDevices.length > 0) {
                    updatedDevice = filteredDevices[0];
                } else {
                    const newDevices = devices.filter(device =>
                        !this.discoveredDevices.some(discovered =>
                            // Check if the device exists in discoveredDevices by matching fqdn (if available) or host + origName
                            (discovered.fqdn && device.fqdn === discovered.fqdn) ||
                            (device.host === discovered.host && device.origName === discovered.origName)
                        )
                    );
                    updatedDevice = newDevices.length > 0 ? newDevices[0] : null;

                    this.device = updatedDevice;
                }

                if (updatedDevice) {
                    this.host = updatedDevice.host;
                    this.port = updatedDevice.port;
                    this.log.info(
                        `Updated device ${this.avr.device.name} connection info: ${this.host}:${this.port}`,
                    );
                    this.reconnectCounter = 0; // Reset counter after successful discovery
                }
            } else {
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        if (!this.socket) {
            this.initializeSocket(callback);
        } else if (
            !this.lastConnect ||
            Date.now() - (this.lastConnect ?? 0) > 15 * 1000
        ) {
            this.disconnect();
            this.log.debug('Reconnecting socket.');
            this.connect();
            this.isConnecting = Date.now();

            try {
                callback();
            } catch (error) {
                this.log.debug('reconnect callback error', error);
            }
        } else {
            if (this.reconnectCallbackTimeout) {
                clearTimeout(this.reconnectCallbackTimeout);
            }
            this.reconnectCallbackTimeout = setTimeout(() => {
                try {
                    callback();
                } catch (error) {
                    this.log.debug('reconnect callback error', error);
                }
            }, 30000);
        }
    }

    disconnect() {
        // this.log.debug('disconnect() called');
        this.isConnecting = null;
        this.setConnectionReady(false);
        this.onDisconnect();

        if (this.socket) {
            this.socket.removeAllListeners('connect');
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }
        this.log.debug('telnet> disconnected!');
    }

    isConnected() {
        return this.connectionReady;
    }

    async sendMessage(
        message: string,
        callbackChars?: string,
        callback?: (error: any, response: string) => void,
    ) {
        if (!this.connectionReady) {
            this.tryReconnect();
        }

        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }

        this.disconnectTimeout = setTimeout(
            () => {
                this.disconnect();
            },
            5 * 60 * 1000,
        );

        // if (this.connectionReady && callbackChars === undefined) {
        //     if (Date.now() - (this.lastWrite ?? 0) < 38) {
        //         await new Promise(resolve => setTimeout(resolve, 50));
        //     }
        if (
            !message.startsWith('?') &&
            !message.startsWith('!') &&
            this.connectionReady &&
            callbackChars === undefined &&
            this.messageQueue.queue.length === 0
        ) {
            this.directSend(message, callback);
        } else {
            this.queueMessage(message, callbackChars, callback);
        }
    }

    public directSend(
        message: string,
        callback?: (error: any, response: string) => void,
    ) {
        if (!this.connectionReady) {
            this.log.warn('Connection not ready, skipping direct send.');
            return;
        }

        if (message.startsWith('!')) {
            message = message.substring(1);
        }

        this.log.debug('telnet write>', message);
        this.socket?.write(message + '\r\n');
        this.setLastWrite(Date.now());
        callback?.(null, `${message}:SENT`);

        this.messageQueue.processQueue();
    }

    private queueMessage(
        message: string,
        callbackChars?: string,
        callback?: (error: any, response: string) => void,
    ) {
        this.messageQueue.enqueue(message, callbackChars, callback!);

        if (this.clearQueueTimeout) {
            clearTimeout(this.clearQueueTimeout);
        }

        this.clearQueueTimeout = setTimeout(() => {
            this.messageQueue.clearQueue();
        }, 15 * 1000);
    }

    public onDisconnect() {
        this.log.debug('Disconnected!');
    }

    public onConnect() {
        this.log.debug('Connected!');
    }

    public setConnectionReady(ready: boolean) {
        this.connectionReady = ready;
    }

    public setLastWrite(timestamp: number) {
        this.lastWrite = timestamp;
    }

    // Accessor for lastMessageReceived from DataHandler
    get lastMessageReceived(): number | null {
        return this.dataHandler?.lastMessageReceived || null;
    }

    // Setter for the last message received timestamp
    set lastMessageReceived(value: number | null) {
        if (this.dataHandler) {
            this.dataHandler.lastMessageReceived = value;
        }
    }
}
