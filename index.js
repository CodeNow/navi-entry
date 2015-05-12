'use strict';

var url = require('url');
var redisTypes = require('redis-types');
var RedisList  = redisTypes.List;
var ErrorCat = require('error-cat');
var last = require('101/last');
var exists = require('101/exists');
var defaults = require('101/defaults');
var isString = require('101/is-string');
var isFunction = require('101/is-function');
var keypather = require('keypather')();
var requireOpt = function (opts, key, instanceKeypath) {
  if (!exists(opts[key])) {
    var message = instanceKeypath ?
      'opts.'+key+' or opts.'+instanceKeypath+' is required':
      'opts.'+key+' is required';

    throw new Error(message);
  }
};
var formatOpts = function (opts) {
  var instance = opts.instance || {};
  var instanceBranchKeypath = 'contextVersion.appCodeVersions[0].lowerBranch';
  defaults(opts, {
    instanceName: instance.name,
    branch      : keypather.get(instance, instanceBranchKeypath),
    masterPod   : instance.masterPod || false
  });
  requireOpt(opts, 'ownerUsername');
  requireOpt(opts, 'instanceName', 'instance.name');
  requireOpt(opts, 'masterPod', 'instance.masterPod');
  requireOpt(opts, 'branch', 'instance.'+instanceBranchKeypath);
  requireOpt(opts, 'userContentDomain');
};

module.exports = NaviEntry;

/**
 * Create hipache host (redis list)
 * @param  {Object|String}  optsOrKey      options or key
 * @param  {String}    opts.exposedPort    container.ports hash key - ex: "80/tcp"
 * @param  {String}    opts.ownerUsername  instance owner's username
 * @param  {String}    [opts.instance]     instance json (including name, cv and masterPod)
 *                                           required if masterPod, branchName, instanceName not provided
 * @param  {String}    [opts.instanceName] instance name
 *                                           will override instance value if both are provided
 *                                           required if instance not provided
 * @param  {String}    [opts.branch]       instance's cv's repos branch
 *                                           will override instance value if both are provided
 *                                           required if instance not provided and not master pod
 * @param  {String}    [opts.masterPod]    whether instance is a masterPod
 *                                           will override instance value if both are provided
 *                                           defaults to false
 * @return {RedisList} hipache host   redis list
 */
function NaviEntry (optsOrKey) {
  var key, opts;
  var args = arguments;
  if (isString(optsOrKey)) {
    key = optsOrKey;
  }
  else {
    opts = optsOrKey;
  }

  if (opts) {
    this.opts = opts;
    formatOpts(opts);
    requireOpt(opts, 'exposedPort');

    var exposedPort       = opts.exposedPort;
    var instanceName      = opts.instanceName;
    var branch            = opts.branch;
    var masterPod         = opts.masterPod;
    var ownerUsername     = opts.ownerUsername;
    var userContentDomain = opts.userContentDomain;

    exposedPort = exposedPort.split('/')[0];
    // the new user domain is active. use the new domain scheme
    var hostname = NaviEntry.createHostname(opts);
    key = [
      'frontend:',
      exposedPort, '.',
      hostname
    ].join('').toLowerCase();

    if (opts.masterPod) {
      this.elasticKey = [
        'frontend:',
        exposedPort, '.',
        hostname.replace(new RegExp('^'+branch+'-'), '')
      ].join('').toLowerCase();
    }
  }
  else {
    this.opts = {};
  }

  RedisList.call(this, key);
}

require('util').inherits(NaviEntry, RedisList);

/**
 * create a NaviEntry instance from host
 * @param  {String} host  host of an instance container
 * @return {NaviEntry}    naviEntry
 */
NaviEntry.createFromHost = function (host) {
  return this.createFromUrl('http://'+host);
};

/**
 * create a NaviEntry instance from uri
 * @param  {String} uri   uri of an instance container
 * @return {NaviEntry}    naviEntry
 */
NaviEntry.createFromUrl = function (uri) {
  var parsed = url.parse(uri);
  parsed.port = parsed.port || '80';
  var key = [
    'frontend:',
    parsed.port, '.',
    parsed.hostname
  ].join('').toLowerCase();
  return new NaviEntry(key.toLowerCase());
};

/**
 * Create host from ops
 * @param  {Object}    opts                options
 * @param  {String}    opts.ownerUsername  instance owner's username
 * @param  {String}    opts.instanceName   instance name
 * @param  {String}    opts.branch         instance's cv's repos branch
 * @param  {String}    opts.masterPod      whether instance is a masterPod
 * @return {String}    host                host
 */
NaviEntry.createHostname = function (opts) {
  formatOpts(opts);
  return [
    opts.branch, '-', opts.instanceName, '-staging-', opts.ownerUsername, '.',
    opts.userContentDomain
  ].join('').toLowerCase();
};

/**
 * provide a redis client to navi entry
 * @param  {Object} redisClient from require('redis').createClient(opts)
 */
NaviEntry.setRedisClient = function (redisClient) {
  redisTypes({ redisClient: redisClient });
};

/**
 * finds instance name for hostname
 * @param  {String}   hostname  instance hostname (no protocol, no port)
 * @param  {Function} cb        callback(err, instanceName)
 */
NaviEntry.findInstanceNameForHostname = function (hostname, cb) {
  var redisClient = NaviEntry.prototype.redisClient;
  if (!redisClient) {
    throw new Error('redis client was not provided');
  }

  redisClient.keys('frontend:*.'+hostname, function (err, keys) {
    if (err) { return cb(err); }
    if (keys.length === 0) {
      return cb(ErrorCat.create(404, 'hostname not found'));
    }
    var naviEntry = new RedisList(keys[0]);
    naviEntry.lindex(0, cb);
  });
};

/**
 * sets the navi entry list values
 * @param {String} backendUrl should be a full url including protocol and port, ex: http://10.0.1.1:80
 * @param {String} [instanceName] instanceName to set in redis
 * @param {Boolean} [masterPod] if instance belongs to masterPod
 * @param {String} [branch] branch that the instance is deployed with
 * @param {Function} cb callback
 */
NaviEntry.prototype.setBackend = function (backendUrl, instanceName, masterPod, branch, cb) {
  if (isFunction(instanceName)) {
    cb = instanceName;
    instanceName = null;
  }
  instanceName = instanceName || this.opts.instanceName;
  if (!instanceName) {
    throw new Error('instanceName or opts.instanceName is required');
  }
  masterPod = masterPod || this.opts.masterPod;
  if (!masterPod) {
    throw new Error('masterPod or opts.masterPod is required');
  }
  var task = this.redisClient.multi();
  if (masterPod) {
    branch = branch || this.opts.branch;
    if (!branch) {
      throw new Error('branch or opts.branch is required');
    }
    var directKey = 'frontend:'+this.getDirectHostname(branch);
    // direct url for masterPod:true
    task
      .del(directKey)
      .rpush(directKey, instanceName)
      .rpush(directKey, backendUrl);
  }
  // direct url (masterPod:false) or elastic url (masterPod:true)
  task
    .del(this.key)
    .rpush(this.key, instanceName)
    .rpush(this.key, backendUrl);
  task.exec(cb);
};

/**
 * get the instance name from the navi entry list
 * @param  {getInstanceNameCb} cb
 */
/**
 * @callback getInstanceNameCb
 * @param {Error}  err
 * @param {String} instanceName instance name in redis
 */
NaviEntry.prototype.getInstanceName = function (cb) {
  var self = this;
  return this.lindex(0, cb);
};

/**
 * get the elastic url associated with the naviEntry
 * NOTE: should only be used for a naviEntry with a DIRECT key
 * @param   {String} branch  branch that instance is for
 * @return  {String} elasticHostname
 */
NaviEntry.prototype.getElasticHostname = function (branch, cb) {
  var re = new RegExp('^frontend:[0-9]+[.]'+branch+'-');
  return this.key.replace(re, '');
};

/**
 * get the elastic url associated with the naviEntry
 * NOTE: should only be used for a naviEntry with a ELASTIC key
 * @param   {String} branch  branch that instance is for
 * @return  {String} elasticHostname
 */
NaviEntry.prototype.getDirectHostname = function (branch, cb) {
  var re = new RegExp('^frontend:[0-9]+[.]');
  return this.key.replace(re, branch+'-');
};