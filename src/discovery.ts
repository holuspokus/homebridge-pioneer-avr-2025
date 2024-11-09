// src/pioneer-avr/discovery.ts

import { networkInterfaces } from 'os';
import * as dgram from 'dgram';
import * as net from 'net';
import * as dns from 'dns';
import bonjour from 'bonjour'; // Bonjour for mDNS discovery



// Main function to discover devices using both multicast and mDNS (Bonjour)
async function findDevices(targetName: string, telnetPorts: number[], log: any): Promise<{ name: string; ip: string; port: number }[]> {
    const devices: { name: string; ip: string; port: number }[] = [];
    const subnetList = getLocalSubnets(log);

    log.debug("Detected subnets:", subnetList);

    // SSDP Discovery for each subnet
    for (const subnet of subnetList) {
        await discoverSSDPDevices(subnet, targetName, telnetPorts, devices, log);
    }

    // mDNS (Bonjour) Discovery
    discoverBonjourDevices(targetName, devices, telnetPorts, log);

    // Delay to ensure both discovery methods complete
    return new Promise((resolve) => {
        setTimeout(() => resolve(devices), 5000);
    });
}

// Discover devices via SSDP
async function discoverSSDPDevices(subnet: string, targetName: string, telnetPorts: number[], devices: { name: string; ip: string; port: number }[], log: any) {
    const multicastSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    multicastSocket.bind(1900, () => multicastSocket.addMembership('239.255.255.250'));

    multicastSocket.on('message', (msg, remote) => {
        const message = msg.toString();
        log.debug('Received multicast message:', message, '\nFrom IP:', remote.address);

        if (message.toLowerCase().includes(targetName.toLowerCase())) {
            const deviceName = extractDeviceName(message);
            getDNSName(remote.address, log).then(dnsName => {
                log.debug('DNS-Name:', dnsName || deviceName || remote.address);
                checkPorts(remote.address, dnsName || deviceName || remote.address, telnetPorts, log).then((device) => {
                    if (device) devices.push(device); // Add device if a port is open
                });
            });
        }
    });

    const discoveryMessage = buildSSDPMessage(log);

    const unicastSocket = dgram.createSocket('udp4');
    unicastSocket.bind(() => {
        unicastSocket.setBroadcast(true);
        unicastSocket.send(discoveryMessage, 0, discoveryMessage.length, 1900, `${subnet}.255`);
    });

    setTimeout(() => {
        multicastSocket.close();
        unicastSocket.close();
    }, 15000);
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
    setTimeout(() => bonjourService.destroy(), 15000);
}

// Build an SSDP message to broadcast for device discovery
function buildSSDPMessage(log: any): Buffer {
    log.debug("Building SSDP message");
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
async function checkPorts(ip: string, name: string, ports: number[], log: any): Promise<{ name: string; ip: string; port: number } | null> {
    for (const port of ports) {
        if (await isPortOpen(ip, port, log)) {
            return { name, ip, port }; // Return device info if port is open
        }
    }
    return null;
}

// Utility to check if a specific port on a device is open
async function isPortOpen(ip: string, port: number, log: any): Promise<boolean> {
    log.debug('in isPortOpen'); // , log: any
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        }).on('error', () => resolve(false)).on('timeout', () => resolve(false)).connect(port, ip);
    });
}

// Get all local subnets by analyzing network interfaces
function getLocalSubnets(log: any): string[] {
    const nets = networkInterfaces();
    const subnets = new Set<string>();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                const subnet = net.address.split('.').slice(0, 3).join('.');
                subnets.add(subnet);
                log.debug(`Found subnet ${subnet} on interface ${name}`);
            }
        }
    }
    return Array.from(subnets);
}

// Extracts a simple device name (e.g., "PioneerVSX") from an SSDP message
function extractDeviceName(message: string): string | null {
    const nameMatch = message.match(/SERVER:.*?([A-Za-z]+)/);
    return nameMatch ? nameMatch[1] : null;
}

// Reverse DNS lookup for a given IP address to get its hostname
function getDNSName(ip: string, log: any): Promise<string | null> {
    return new Promise((resolve) => {
        dns.reverse(ip, (err, hostnames) => {
            if (err) {
                log.debug(`Could not reverse lookup DNS for IP ${ip}:`, err);
                resolve(null); // Return null on errors
            } else if (hostnames.length > 0) {
                resolve(hostnames[0]); // Return the first hostname
            } else {
                resolve(null);
            }
        });
    });
}

export { findDevices };
