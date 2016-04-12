'use strict';

var Utils = require('./utils.js').Utils;
var Service, Characteristic, Websocket;

Number.prototype.pad = function (len) {
    return (new Array(len+1).join("0") + this).slice(-len);
}

module.exports = {
  Accessory: Accessory
}

function Accessory(params) {
     
  this.accessoryDef = params.accessoryDef;
  this.log = params.log;
  Service = params.Service;
  Characteristic = params.Characteristic;
  Websocket = params.Websocket;
  
  this.name = this.accessoryDef.name;
  this.service_name = this.accessoryDef.service;
  
  this.i_value = {};  
  this.i_label = {};
  this.i_props = {};
  
  this.service;
}

Accessory.prototype.save_and_setValue = function (trigger, c, value) {

  var sc = this.service.getCharacteristic(Characteristic[c]);
  //this.log.debug("Accessory.save_and_setValue %s %s %s", trigger, c, value);
  //this.log.debug("Accessory.save_and_setValue %s", JSON.stringify(sc));
  
  switch (sc.props.format) {
    case "bool":
      if (value == "undef") value = false;
      value = (value == 0 || value == false) ? false : true;
      break;
      
    case "int":
    case "uint8":
    case "uint16":
    case "unit32":
    case "float":
      if (value == "undef") value = 0;
      if (value < sc.props.minValue || value > sc.props.maxalue) {
        this.log.error("Accessory.save_and_setValue %s %s value >%s< outside range [trigger: %s].", this.name, c, value, trigger);
      }
      break;

    default:
      // todo string, tlv8, 
      this.log.warn("Accessory.save_and_setValue %s %s %s format unknown [trigger: %s].", this.name, c, value, trigger);
  }
  
  this.i_value[c] = value;
  this.setLabel(trigger, c);

  var context = this.i_label[c];
  //context is also used by the hap-server ('get' and 'set' event) - "context": {"keepalive":true, ...
  //this.log.debug("Accessory.save_and_setValue %s %s %s %s %s ", trigger, this.name, c, value, JSON.stringify(context));

  if (typeof(context) !== "undefined") {
    sc.setValue(value, null, context);
  }
  else {
    sc.setValue(value);
  }
}

Accessory.prototype.setLabel = function(trigger, c) {

  var now = new Date();
  var timestamp = now.getHours().pad(2)+":"+now.getMinutes().pad(2)+":"+now.getSeconds().pad(2);
   // +","+now.getMilliseconds(); 
  
  this.i_label[c] = {
    "timestamp": timestamp,
    "trigger": trigger
  };
}

Accessory.prototype.addService = function(newAccessory) {

  newAccessory.addService(Service[this.service_name], this.name);
}

Accessory.prototype.configureAccessory = function(accessory) {
   
  accessory.on('identify', function(paired, callback) {this.identify(paired, callback)}.bind(this));
  
  //this.service = accessory.getService(Service[this.service_name]);
  this.service = accessory.getService(this.name);  // todo ???
    
  //this.log.debug("Accessory.configureAccessory %s %s %s\n", this.name, this.service_name, JSON.stringify(this.service.characteristics));

  this.log.debug("Accessory.configureAccessory %s", JSON.stringify(this.accessoryDef, null, 2));
  
  var c;
  for (var k in this.service.characteristics) {
  
    c = this.service.characteristics[k].displayName.replace(/\s/g, "");
    //this.log.debug("Accessory.configureAccessory %s %s %s", this.name, this.service_name, c);
    
    if (c != "Name") {
      this.allocate(c);
      this.setProps(c);
      this.i_value[c] = "blank";
      this.i_props[c] = JSON.parse(JSON.stringify(this.service.getCharacteristic(Characteristic[c]).props));
      //this.log.debug("Accessory.configureAccessory %s %s %s %s", this.name, this.service_name, c, JSON.stringify(this.i_props));
    }
  }
  
  // note: if the accessories are restored from cachedAccessories, the optionalCharacteristics are stored in characteristics.
  for (var k in this.service.optionalCharacteristics) {
    
    c = this.service.optionalCharacteristics[k].displayName.replace(/\s/g, "");
      
    if (typeof(this.accessoryDef[c]) !== "undefined") {
      this.log.debug("Accessory.configureAccessory %s %s optional %s", this.name, this.service_name, c);
      
      if (c != "Name") {
        this.allocate(c);
        this.setProps(c);
        this.i_value[c] = "blank";
        this.i_props[c] = JSON.parse(JSON.stringify(this.service.getCharacteristic(Characteristic[c]).props));
      }
    }
  }
}

Accessory.prototype.allocate = function(c) {

  var self = this;
  var sc = this.service.getCharacteristic(Characteristic[c]);
  
  sc.on('get', function(callback, context) {self.get(callback, context, this.displayName)});
  if (sc.props.perms.indexOf("pw") > -1) { 
    //this.log.debug("Accessory.allocate 'set' event %s %s", this.name, c);
    sc.on('set', function(value, callback, context) {self.set(value, callback, context, this.displayName)});
  }
}

Accessory.prototype.setProps = function(c) {

  if (typeof(this.accessoryDef[c]) !== "undefined") {
    if (this.accessoryDef[c] != "default") {
      this.service.getCharacteristic(Characteristic[c]).setProps(this.accessoryDef[c]);
    }
    this.log.debug("Accessory.setProps %s %s", this.name, c, this.accessoryDef[c]);
    //this.log.debug("Accessory.setProps %s %s", this.name, c, Characteristic[c]);
  }
}

Accessory.prototype.get = function(callback, context, displayName) {
  
  var c = displayName.replace(/\s/g, "");
  this.log.debug("Accessory.get %s %s", this.name, c);
  
  Websocket.get(this.name, c, callback);
}

Accessory.prototype.set = function(value, callback, context, displayName) {

  var c = displayName.replace(/\s/g, "");
  //this.log.debug("Accessory.set %s %s %s %s", this.name, c, value, JSON.stringify(context));
  
  this.i_value[c] = value;
  
  if (typeof(context) !== "undefined" && typeof(context.trigger) === "undefined") {
    this.setLabel("homekit", c);
  }

  if (typeof(context) !== "undefined" && typeof(context.trigger) !== "undefined" && context.trigger.match(/websocket/g)) {
    //this.log.debug("Accessory.set %s %s %s - websocket", this.name, c, value);
    callback();
  } else {
   Websocket.set(this.name, c, value, callback);
  }
}

Accessory.prototype.identify = function (paired, callback) {

  this.log("Accessory.identify %s", this.name);
  // todo
  callback();
}
