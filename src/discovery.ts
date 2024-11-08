// src/pioneer-avr/discovery.ts

import { networkInterfaces } from 'os';
import * as dgram from 'dgram';
import * as net from 'net';
import * as dns from 'dns';

// Main function to discover devices using both multicast and unicast
async function findDevices(targetName: string, telnetPorts: number[]): Promise<{ name: string; ip: string; port: number }[]> {
    const devices: { name: string; ip: string; port: number }[] = [];
    const subnet = getLocalSubnet();

    // Create a multicast socket for SSDP discovery
    const multicastSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    multicastSocket.bind(1900, () => {
        multicastSocket.addMembership('239.255.255.250');
    });

    // Handle incoming multicast responses for device names and IPs
    multicastSocket.on('message', (msg, remote) => {
        const message = msg.toString()

        if (message.toLowerCase().includes(targetName.toLowerCase())) {
            const deviceName = extractDeviceName(message);
            getDNSName(remote.address).then(dnsName => {
                // console.log('DNS-Name:', dnsName || deviceName || remote.address);
                checkPorts(remote.address, dnsName || deviceName || remote.address, telnetPorts).then((device) => {
                    if (device) devices.push(device); // Add device if a port is open
                });
            });

        }
    });

    // Create a unicast socket to send SSDP messages across the local subnet
    const unicastSocket = dgram.createSocket('udp4');
    const discoveryMessage = buildSSDPMessage();

    unicastSocket.bind(() => {
        unicastSocket.setBroadcast(true);
        unicastSocket.send(discoveryMessage, 0, discoveryMessage.length, 1900, `${subnet}.255`);
    });

    // Close sockets after 5 seconds and return the list of discovered devices
    return new Promise((resolve) => {
        setTimeout(() => {
            multicastSocket.close();
            unicastSocket.close();
            resolve(devices);
        }, 5000);
    });
}

// Build an SSDP message to broadcast for device discovery
function buildSSDPMessage() {
    return Buffer.from([
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'MX: 1',
        'ST: ssdp:all',
        '', ''
    ].join('\r\n'));
}

// Check specific ports for open connections on each device
async function checkPorts(ip: string, name: string, ports: number[]): Promise<{ name: string; ip: string; port: number } | null> {
    for (const port of ports) {
        if (await isPortOpen(ip, port)) {
            return { name, ip, port }; // Return device info if port is open
        }
    }
    return null;
}

// Utility to check if a specific port on a device is open
async function isPortOpen(ip: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        }).on('error', () => resolve(false)).on('timeout', () => resolve(false)).connect(port, ip);
    });
}

// Get the local subnet by analyzing network interfaces
function getLocalSubnet(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address.split('.').slice(0, 3).join('.');
            }
        }
    }
    return '192.168.1'; // Default subnet in case none is detected
}

// Extracts a simple device name (e.g., "PioneerVSX") from an SSDP message
function extractDeviceName(message: string): string | null {
    const nameMatch = message.match(/SERVER:.*?([A-Za-z]+)/);
    return nameMatch ? nameMatch[1] : null;
}


// Sample:
// getDNSName('8.8.8.8').then(dnsName => {
//     console.log('DNS-Name:', dnsName || 'Kein DNS-Name gefunden');
// });
function getDNSName(ip: string): Promise<string | null> {
    return new Promise((resolve) => {
        dns.reverse(ip, (err, hostnames) => {
            if (err) {
                console.error(`Could not reverse lookup DNS for IP ${ip}:`, err);
                resolve(null); // Kehrt bei Fehlern mit null zurück
            } else if (hostnames.length > 0) {
                resolve(hostnames[0]); // Gibt den ersten Hostnamen zurück
            } else {
                resolve(null);
            }
        });
    });
}

export { findDevices };
