// src/pioneer-avr-platform.ts

import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { findDevices } from './discovery';
import PioneerAvrAccessory from './pioneer-avr-accessory.js';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class PioneerAvrPlatform implements DynamicPlatformPlugin {
  public readonly service: typeof Service;
  public readonly characteristic: typeof Characteristic;
  private name: string;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.service = this.api.hap.Service;
    this.characteristic = this.api.hap.Characteristic;
    this.name = this.config.name || 'PioneerVSX Platform'

    this.log.debug('Finished initializing platform:', this.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    const TELNET_PORTS = [23, 24, 8102];
    const TARGET_NAME = "VSX";

    let devicesFound: any[] = [];

    if (this.name && this.config.ip && this.config.port) {
      // Use manually configured device and skip discovery
      devicesFound.push({
          name: this.name,
          ip: this.config.ip,
          port: this.config.port,
      });
      console.log('Using manually configured device:', devicesFound);
      this.loopDevices(devicesFound)
    } else {
      // Perform discovery as no manual config was provided
      findDevices(TARGET_NAME, TELNET_PORTS, this.log).then(devices => {
          devicesFound.push(...devices);
          if (devicesFound.length == 0) {
              this.log.warn('No devices found. Please configure manually.')
          }else{
            this.log.debug('Discovered devices:', devicesFound);
            this.loopDevices(devicesFound)
          }

      });
    }
  }


  loopDevices(foundDevices) {
    // loop over the discovered devices and register each one if it has not already been registered
    for (const founddevice of foundDevices) {
      this.log.debug('on device:', founddevice)

      try {

          // generate a unique id for the accessory this should be generated from
          // something globally unique, but constant, for example, the device serial
          // number or MAC address
          const uuid = this.api.hap.uuid.generate(String(founddevice.name) + String(founddevice.ip) + String(founddevice.port));

          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
            // existingAccessory.context.device = device;
            // this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`

            (async (): Promise<void> => {
                await new PioneerAvrAccessory(founddevice, this, existingAccessory).untilBooted();

                // link the accessory to your platform
                this.api.registerPlatformAccessories(this.name, this.config.name || 'PioneerVSX Accessory', [existingAccessory]);
            })();

            // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
            // remove platform accessories when no longer present
            // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
          } else {
            // the accessory does not yet exist, so we need to create it
            this.log.info('Adding new accessory:', founddevice.name || 'PioneerVSX Accessory');

            // create a new accessory
            const accessory = new this.api.platformAccessory(founddevice.name || 'PioneerVSX Accessory', uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = founddevice;

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            // new PioneerAvrAccessory(this, accessory);

            (async (): Promise<void> => {
                await new PioneerAvrAccessory(founddevice, this, accessory).untilBooted();

                // link the accessory to your platform
                this.api.registerPlatformAccessories(this.name, this.config.name || 'PioneerVSX Accessory', [accessory]);
            })();

          }

        } catch (e) {
            this.log.debug('loopDevices', e)
        }
    }
  }
}
