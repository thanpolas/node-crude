/*jshint camelcase:false */
/**
 * @fileOverview The bare CRUD command implementations
 *
 */
var EventEmitter = require('events').EventEmitter;

var cip = require('cip');
var __  = require('lodash');
var appErr = require('nodeon-error');
var middlewarify = require('middlewarify');

var Create = require('./crud-ops/create');
var Read = require('./crud-ops/read');
var Update = require('./crud-ops/update');
var Delete = require('./crud-ops/delete');
var Pagination = require('./crud-ops/pagination');
var Handlers = require('./handlers');

// sign the error objects
appErr.setName('crude');

var CeventEmitter = cip.cast(EventEmitter);

/**
 * The CRUD Commands
 *
 * @param {string} baseUrl The baseUrl to use.
 * @param {Object} controller The controller.
 * @param {Express=} optExpress An express instance.
 * @contructor
 * @extends {EventEmitter}
 */
var Crude = module.exports = CeventEmitter.extend(function(baseUrl, controller,
  optExpress) {
  if (typeof baseUrl !== 'string') {
    throw new TypeError('First argument should be a string represeting the baseUrl');
  }

  /** @type {?Express} The Express instance. */
  this.express = optExpress || null;

  // will throw proper error
  this._validateController(controller);

  /** @type {Object} Options, look at setOptions() */
  this.opts = {};

  /** @type {string} The route to use. */
  this.baseUrl = baseUrl;

  /**
   * @type {Object} Object with the expected key / callbacks.
   *       @param {Function(Object)} create
   *       @param {Function(Object)} read
   *       @param {Function(Object)} readLimit
   *       @param {Function(Object)} readOne
   *       @param {Function(Object)} update
   *       @param {Function(Object)} count
   */
  this.controller = controller;

  // define CRUD middleware
  this.create = [];
  this.readOne = [];
  this.readList = [];
  this.update = [];
  this.delete = [];

  // define CRUD Query middleware
  function noopReturn(query) {return query;}
  middlewarify.make(this, 'createQuery', noopReturn);
  middlewarify.make(this, 'readOneQuery', noopReturn);
  middlewarify.make(this, 'readListQuery', noopReturn);
  middlewarify.make(this, 'updateQuery', noopReturn);
  middlewarify.make(this, 'deleteQuery', noopReturn);

  var self = this;
  function use(middleware) {
    this.push(middleware);
    return self;
  }
  this.create.use = use;
  this.readOne.use = use;
  this.readList.use = use;
  this.update.use = use;
  this.delete.use = use;

  this._setDefaults();

  if (this.express) {
    this.addRoutes(this.express);
  }

});
Crude.mixin(Create);
Crude.mixin(Read);
Crude.mixin(Update);
Crude.mixin(Delete);
Crude.mixin(Pagination);
Crude.mixin(Handlers);

/**
 * Mark the proto to check for proper inheritance of methods,
 * we do this so we can lax comparison by not relying 100% on "instanceof".
 *
 * @type {boolean}
 * @protected
 */
Crude.prototype._isCrude = true;

/**
 * Configure crude.
 *
 * @param {Object} options Key value pairs.
 * @return {self} Chainable.
 */
Crude.prototype.config = function(options) {
  __.extend(this.opts, options);
  return this;
};

/**
 * Set Default options.
 *
 * @return {self} Chainable.
 */
Crude.prototype._setDefaults = function() {
  // Map the ID visible in URLs to a DB attribute.
  this.opts.idField = 'id';
  // Define this key so 'from' & 'to' params query the right attribute
  this.opts.dateField = 'createdAt';
  // Set to false to not paginate.
  this.opts.pagination = true;
  // Callback to set the pagination query.
  this.opts.paginateQuery = null;
  // Default item to limit to on pagination.
  this.opts.paginateLimit = 6;
  // Maximum pagination record fetching limit.
  this.opts.maxPaginateLimit = 100;
  // Set Multiple items query Separator key.
  this.opts.multiSepKey =  ',';
  // Use AND when there are multiple query items instead of default 'OR'.
  this.opts.multiQueryAnd = false;

  this.opts.onSuccess = this.handleSuccess.bind(this);
  this.opts.onError = this.handleError.bind(this);
};

/**
 * Insert at the beginning of all routes the provided middleware.
 *
 * @param {Function} middleware The middleware to insert.
 * @return {self} Chainable.
 */
Crude.prototype.use = function(middleware) {
  this.create.use(middleware);
  this.readOne.use(middleware);
  this.readList.use(middleware);
  this.update.use(middleware);
  this.delete.use(middleware);

  return this;
};

/**
 * Applies query middleware to all CRUD OPs.
 *
 * @param {Function} middleware The middleware to insert.
 * @return {self} Chainable.
 */
Crude.prototype.useQuery = function(middleware) {
  this.readOneQuery.use(middleware);
  this.readListQuery.use(middleware);
  this.updateQuery.use(middleware);
  this.deleteQuery.use(middleware);

  return this;
};

/**
 * The actual route add operation, decoupled from add to skip instanceof checks.
 *
 * @param {Express} express The express instance.
 * @param {string} baseUrl The base URL to attach the routes.
 * @param {crude.Crude} crude an instance if crude.
 * @return {self} Chainable.
 */
Crude.prototype.addRoutes = function(express) {
  express.get(this.baseUrl, [this.readList, this._readList.bind(this)]);
  express.post(this.baseUrl, [this.create, this._create.bind(this)]);
  express.get(this.baseUrl + '/:id', [this.readOne, this._readOne.bind(this)]);
  express.put(this.baseUrl + '/:id', [this.update, this._update.bind(this)]);
  express.patch(this.baseUrl + '/:id', [this.update, this._update.bind(this)]);
  express.delete(this.baseUrl + '/:id', [this.delete, this._delete.bind(this)]);

  this.express = express;

  return this;
};

/**
 * Set the master callback for success on all CRUD ops.
 *
 * @param {Function} fn A callback.
 * @return {self} Chainable.
 */
Crude.prototype.onSuccess = function(fn) {
  this.opts.onSuccess = fn;
  return this;
};


/**
 * Set the master callback for errors on all CRUD ops.
 *
 * @param {Function} fn A callback.
 * @return {self} Chainable.
 */
Crude.prototype.onError = function(fn) {
  this.opts.onError = fn;
  return this;
};

/**
 * Validates a controller has the expected functions.
 *
 * @param {Object} ctrl The controller to validate.
 * @throws {TypeError} If not valid.
 * @protected
 */
Crude.prototype._validateController = function(ctrl) {
  if (!__.isObject(ctrl)) {
    throw new TypeError('Injected Controller not of type Object');
  }

  if (typeof ctrl.create !== 'function') {
    throw new TypeError('Injected Controller does not contain the "create" method');
  }
  if (typeof ctrl.read !== 'function') {
    throw new TypeError('Injected Controller does not contain the "read" method');
  }
  if (typeof ctrl.readLimit !== 'function') {
    throw new TypeError('Injected Controller does not contain the "readLimit" method');
  }
  if (typeof ctrl.readOne !== 'function') {
    throw new TypeError('Injected Controller does not contain the "readOne" method');
  }
  if (typeof ctrl.update !== 'function') {
    throw new TypeError('Injected Controller does not contain the "update" method');
  }
  if (typeof ctrl.count !== 'function') {
    throw new TypeError('Injected Controller does not contain the "count" method');
  }
};
