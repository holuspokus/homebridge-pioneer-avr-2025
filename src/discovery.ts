// src/pioneer-avr/discovery.ts

import * as net from 'net';
import bonjour from 'bonjour'; // Bonjour for mDNS discovery

// Main function to discover devices using mDNS (Bonjour) only
async function findDevices(targetName: string, telnetPorts: number[], log: any): Promise<{ name: string; ip: string; port: number }[]> {
    const devices: { name: string; ip: string; port: number }[] = [];
    discoverBonjourDevices(targetName, devices, telnetPorts, log);

    // Delay to ensure Bonjour discovery completes before resolving the devices list
    return new Promise((resolve) => {
        setTimeout(() => resolve(devices), 5000);
    });
}

// mDNS (Bonjour) Discovery with port check
function discoverBonjourDevices(targetName: string, devices: { name: string; ip: string; port: number }[], telnetPorts: number[], log: any) {
    const bonjourService = bonjour();
    log.debug("Searching for Pioneer Receivers via Bonjour...");

    // Browse for HTTP services or specify a specific type if known
    bonjourService.find({ type: 'http' }, (service) => {
        if (service.name && service.name.toLowerCase().includes(targetName.toLowerCase())) {
            log.debug("Found Pioneer Receiver via Bonjour:", service.name);

            const ip = service.referer.address;
            const name = service.name;

            // Check if one of the defined Telnet ports is open on this device
            checkPorts(ip, name, telnetPorts, log).then((device) => {
                if (device) {
                    log.debug(`Device with open port found: ${device.name} at ${device.ip}:${device.port}`);
                    // Add the device if it passes the port check and is not already in the list
                    if (!devices.some(d => d.ip === device.ip && d.port === device.port)) {
                        devices.push(device);
                    }
                } else {
                    log.debug(`No open Telnet ports found for ${name} at ${ip}`);
                }
            });
        }
    });

    // Stop Bonjour search after a set duration
    setTimeout(() => bonjourService.destroy(), 1000);
}

// Check specific ports for open connections on each device
async function checkPorts(ip: string, name: string, ports: number[], log: any): Promise<{ name: string; ip: string; port: number } | null> {
    for (const port of ports) {
        if (await isPortOpen(ip, port, log)) {
            return { name, ip, port }; // Return device info if port is open
        }
    }
    return null;
}

// Utility to check if a specific port on a device is open, with a connection attempt
async function isPortOpen(ip: string, port: number, log: any): Promise<boolean> {
    log.debug(`Checking if port ${port} on IP ${ip} is open`);

    return new Promise((resolve) => {
        const socket = new net.Socket();
        let isConnectionOpen = false;

        // Set a 10-second timeout for the entire operation
        socket.setTimeout(10000);

        // Attempt to connect and check if we can access the port via Telnet
        socket.connect(port, ip, () => {
            log.debug(`Port ${port} on IP ${ip} responded; attempting to close connection.`);
            isConnectionOpen = true;
            socket.end(); // Close the connection
        });

        // Event: Successful connection and closure
        socket.on('close', () => {
            resolve(isConnectionOpen);
        });

        // Event: Error in connection attempt (port likely closed)
        socket.on('error', (err) => {
            log.debug(`Error accessing port ${port} on IP ${ip}: ${err.message}`);
            resolve(false);
        });

        // Event: Connection timed out
        socket.on('timeout', () => {
            log.debug(`Timeout reached when checking port ${port} on IP ${ip}`);
            socket.destroy();
            resolve(false);
        });
    });
}

export { findDevices };
