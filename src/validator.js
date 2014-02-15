'use strict';

angular.module('validator', []).factory('Validator', ['$q', '$parse', function ValidatorFactory($q, $parse) {

  var EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  var NUMERIC_REGEX = /^[0-9]*$/;

  var ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]*$/;

  var NUMERICSPACE_REGEX = /^[0-9\s]*$/;

  var ALPHANUMERICSPACE_REGEX = /^[a-zA-Z0-9\s]*$/;

  function isNotDefined(value) {
    return value === undefined || value === null;
  }

  /*
  * Contains all the registered constraints, Validator comes with built-in constraints.
  * TODO : Allow to register new constraints with Validator.register(function() {...})
  */
  var constraintFunctions = {

    /*
     * Check that the field is presnet (!= undefined, != null and != '')
    */
    required : function (value) { return !isNotDefined(value) && value !== ''; },

    /*
     * Check the field minimum value : min(42)
    */
    min : function (value, minValue) { return isNotDefined(value) || value >= minValue; },

    /*
     * Check the field maximum value : max(42)
    */
    max : function (value, maxValue) { return isNotDefined(value) || value <= maxValue; },

    /*
     * Check that field is a positive number
    */
    positive : function (value) { return isNotDefined(value) || value >= 0; },

    /*
     * Check that field is a negative number
    */
    negative : function (value) { return isNotDefined(value) || value <= 0; },

    /*
     * Check min length of the field : minLength(42)
    */
    minLength : function (value, min) { return isNotDefined(value) || value.length >= min; },

    /*
     * Check min length of the field : maxLength(42)
    */
    maxLength : function (value, max) { return isNotDefined(value) || value.length <= max; },

    /*
     * Check length of the field : length(42)
    */
    length : function (value, fixedLength) { return isNotDefined(value) || value.length === fixedLength; },

    /*
     * Check that field only contains alpha-numeric or space characters: ex: match(/[a-zAZ]+/)
    */
    match : function (value, regexp) { return isNotDefined(value) || regexp.test(value); },

    /*
     * Check that field is a valid email adress
    */
    email : function (value) { return isNotDefined(value) || EMAIL_REGEX.test(value); },

    /*
     * Check that field only contains numeric characters
    */
    numeric : function (value) { return isNotDefined(value) || NUMERIC_REGEX.test(value); },

    /*
     * Check that field only contains alpha-numeric characters
    */
    alphanum : function (value) { return isNotDefined(value) || ALPHANUMERIC_REGEX.test(value); },

    /*
     * Check that field only contains numeric or space characters
    */
    numericSpace : function (value) { return isNotDefined(value) || NUMERICSPACE_REGEX.test(value); },

    /*
     * Check that field only contains alpha-numeric or space characters
    */
    alphanumSpace : function (value) { return isNotDefined(value) || ALPHANUMERICSPACE_REGEX.test(value); },

    /*
     * Check field value is one of the input params: oneOf('toto', 'titi', 'tata')
    */
    oneOf : function () {
      var value = arguments[0];

      if (isNotDefined(value)) {
        return true;
      }

      for (var i = 1; i < arguments.length; i++) {
        if (value === arguments[i]) {
          return true;
        }
      }
      return false;
    },

  };

  /*
    Contains a list of validation checks, that can be applyed to a unit field
    RulesClass instances are returned by calls to Validator.rule('error message'), ex: Validator.rule('error message').min(42)
  */
  var RuleClass = function (message) {
    this.message = message;
    this.rules = [];
  };

  // For each constraintfunction, construct a "chain invocation style function" for RuleClass
  function constructRuleClassFunction(checkName) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      this.rules.push({
        check: checkName,
        fct: constraintFunctions[checkName],
        options: args
      });
      return this;
    };
  }

  for (var id in constraintFunctions) {
    RuleClass.prototype[id] = constructRuleClassFunction(id);
  }


  /*
  * Apply all the registered constraints to the input value, 
  * returns undefined if all constraints are ok, else returns the rule object that was not validated
  */
  RuleClass.prototype.check = function (value) {
    for (var i = 0; i < this.rules.length; i++) {
      var rule = this.rules[i];

      // Construct arguments of the called check function
      var args = [value];
      for (var j in rule.options) {
        if (typeof rule.options[j] === 'function') {
          args.push(rule.options[j](value));
        } else {
          args.push(rule.options[j]);
        }
      }

      if (!rule.fct.apply(null, args)) {
        return rule;
      }
    }
  };

  /*
  Validate a simple field, and returns a promise
  */
  RuleClass.prototype.validate = function (value) {

    var deferred = $q.defer();

    var result = this.check(value);

    if (result !== undefined) {
      deferred.reject({
        message: this.message,
        check: result.check,
        options: result.options,
        value: value
      });
    } else {
      deferred.resolve();
    }

    return deferred.promise;
  };

  /*
  * Apply a list of validation rules to an object, constructed by Validator({...});
  */
  var RuleSetClass = function (ruleSet) {
    this.ruleSet = ruleSet;
  };

  /*
  * Validate an object, and returns a promise
  */
  RuleSetClass.prototype.validate = function (object) {
    var deferred = $q.defer();
    var errors = {};
    var inError = false;

    for (var propName in this.ruleSet) {
      // Using $parse, eval the value of the field on the input object
      var propGetter = $parse(propName);
      var propValue = propGetter(object);

      var rules = this.ruleSet[propName];

      if (!angular.isArray(rules)) {
        rules = [rules];
      }

      for (var i in rules) {
        var rule = rules[i];
        var ruleResult = rule.check(propValue);

        if (ruleResult !== undefined) {
          inError = true;
          var errorObject = {
            check: ruleResult.check,
            field: propName,
            value: propValue,
            message: rule.message,
            options: ruleResult.options
          };
          // If propName expression match an assignable field -> use $parse
          if (propGetter.assign !== undefined) {
            propGetter.assign(errors, errorObject);
          }
          // Else directly assign it to errors object
          else {
            errors[propName] = errorObject;
          }

          break;
        }
      }
    }

    if (inError > 0) {
      deferred.reject(errors);
    } else {
      deferred.resolve();
    }

    return deferred.promise;
  };

  /*
    Validator service
  */
  var Validator = function (arg) {
    if (typeof arg === 'string') {
      return new RuleClass(arg);
    } else if (typeof arg === 'object') {
      return new RuleSetClass(arg);
    } else {
      return undefined;
    }
  };

  return Validator;


}]);