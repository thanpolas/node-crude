/**
 * @fileOverview The Read of the CRUD ops, a mixin.
 */
var cip = require('cip');
var Promise = require('bluebird');

var enums = require('../enums');

/**
 * The Read of the CRUD ops.
 *
 * @param {app.ctrl.ControllerCrudBase} base DI The callee instance.
 * @constructor
 */
var Read = module.exports = cip.extend();

/**
 * Controller for Read List, checks if pagination or read all.
 *
 * @param {Object} req The request Object.
 * @param {Object} res The response Object.
 * @return {Promise} A Promise.
 * @protected
 */
Read.prototype._readList = Promise.method(function(req, res) {
  if (this.opts.pagination) {
    return this.paginate(req, res);
  } else {
    return this._readListAll(req, res);
  }
});

/**
 * Reads and returns all the items.
 *
 * @param {Object} req The request Object.
 * @param {Object} res The response Object.
 * @return {Promise} A Promise.
 * @protected
 */
Read.prototype._readListAll = Promise.method(function(req, res) {
  var query = this.parseQueryParams(req);
  var self = this;
  return this.readListQuery(query, req, res)
    .bind(this)
    .then(function (queryFinal) {
      return Promise.try(function() {
        return self.controller.read(queryFinal);
      });
    })
    .then(this.mkSuccessHandler(req, res, enums.CrudOps.READ))
    .catch(this.mkErrorHandler(req, res, enums.CrudOps.READ));
});

/**
 * Handle a single item view.
 *
 * @param {Object} req The request Object.
 * @param {Object} res The response Object.
 * @return {Promise} A promise.
 * @protected
 */
Read.prototype._readOne = Promise.method(function(req, res) {
  // attempt to fetch the record...
  var query = new Object(null);
  query[this.opts.idField] = req.params.id;

  var self = this;
  return this.readOneQuery(query, req, res)
    .bind(this)
    .then(function (queryFinal) {
      return Promise.try(function() {
        return self.controller.readOne(queryFinal);
      });
    })
    .then(this.mkSuccessHandler(req, res, enums.CrudOps.READ_ONE))
    .catch(this.mkErrorHandler(req, res, enums.CrudOps.READ_ONE));
});

/**
 * Parses the request parameters (query string) and translates them into
 * query for the db.
 *
 * @param {express.Request} req The request object.
 * @return {Object} The query to use.
 */
Read.prototype.parseQueryParams = function(req) {
  var query = {};
  if (!req.query) {
    return query;
  }

  var keys = Object.keys(req.query);
  if (!keys.length) {
    return query;
  }

  if (req.query.from) {
    if (req.query.to) {
      query[this.opts.dateField] = {between: [
        req.query.from,
        req.query.to,
      ]};
    } else {
      query[this.opts.dateField] = {gte: req.query.from};
    }
  } else if (req.query.to) {
    query[this.opts.dateField] = {lte: req.query.to};
  }

  var skipKeys = ['from', 'to', 'show', 'page'];

  keys.forEach(function(key) {
    if (skipKeys.indexOf(key) > -1) {
      return;
    }

    // check for multiple items
    var parts = req.query[key].split(this.opts.multiSepKey);

    if (parts.length > 1) {
      if (this.opts.multiQueryAnd) {
        query[key] = {and: parts};
      } else {
        query[key] = {in: parts};
      }
    } else {
      query[key] = req.query[key];
    }
  }, this);

  return query;
};
