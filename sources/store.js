/** @fileoverview
  * This tool reads the output of parse.js and writes it into a PostgreSQL
  * database. Use like this:
  *
  * node store.js template.sld fields.csv
  *
  * Data gets written into the following tables:
  *
  * - sld_template      Template XML from parse.js, with modifiable parameters
  *                     replaced by placeholders.
  * - sld_featuretype   FeatureTypeStyle tags.
  * - sld_rule          Rules inside FeatureTypeStyles, and their names.
  * - sld_param         Modifiable parameters inside rules, and their
  *                     default values.
  * - sld_type          Location of each parameter type in the SLD structure.
  *                     Essentially fieldSpecList from parse.js is stored here
  *                     in serialized form. */

var fs=require('fs');
var pg=require('pg.js');
var Promise = require('es6-promise').Promise;

/** @constructor
  * Deferred encapsulates a promise that gets fulfilled by outside code. */
var Deferred=function() {
	var self=this;

	this.promise=new Promise(function(resolve,reject) {
		self.resolve=resolve;
		self.reject=reject;
	});
};

/** Return a new function that calls fn making it see the desired scope
  * through its "this" variable.
  * @param {Object} scope Variable fn should see as "this".
  * @param {function()} fn Function to call. */
function bindToScope(scope, fn) {
	return function() {
		fn.apply(scope, arguments);
	};
};

/** @constructor
  * PostgreSQL database interface.
  * Simple wrapper to use promises with pg.js. */
var PgDatabase=function() {
	this.client=null;
};

/** @param {Object} conf Contains attributes:
  * host, port, database, user and password. */
PgDatabase.prototype.connect=function(conf) {
	var defer=new Deferred();

	this.client=new pg.Client(conf);
	this.client.connect(function(err) {
		if(err) return(defer.reject('Unable to connect to database: '+err));
		defer.resolve();
	});

	return(defer.promise);
}

PgDatabase.prototype.close=function(conf) {
	return(Promise.resolve(this.client.end()));
}

/** Execute query without reading any results. */
PgDatabase.prototype.exec=function() {
	var query=this.client.query.apply(this.client,arguments);
	var defer=new Deferred();

	query.on('error',function(err) {
		defer.reject(err);
	});

	query.on('end',function(state) {
		defer.resolve(state);
	});

	return(defer.promise);
}

/** Send query to database and read a single result row. */
PgDatabase.prototype.querySingle=function() {
	var query=this.client.query.apply(this.client,arguments);
	var defer=new Deferred();
	var result;

	query.on('row',function(row) {
		result=row;
	});

	query.on('error',function(err) {
		defer.reject(err);
	});

	query.on('end',function(state) {
		if(!result) return(defer.reject('Not found'));
		defer.resolve(result);
	});

	return(defer.promise);
}

PgDatabase.prototype.begin=function() {
	return(this.exec('BEGIN TRANSACTION'));
}

PgDatabase.prototype.commit=function() {
	return(this.exec('COMMIT'));
}

PgDatabase.prototype.rollback=function() {
	return(this.exec('ROLLBACK'));
}

/** @constructor
  * SldInserter stores a parsed SLD template and field configuration
  * into an SQL database. */
var SldInserter=function() {
	this.db=null;
	this.dbConf=null;
}

/** @param {string} dbPath Name of JSON file with database address and credentials. */
SldInserter.prototype.connect=function(dbPath) {
	var defer=new Deferred();

	this.db=new PgDatabase();

	try {
		var dbJson=fs.readFileSync(dbPath,'utf-8');
		this.dbConf=JSON.parse(dbJson);
		defer.resolve();
	} catch(e) {
		defer.reject('Unable to read database configuration: '+e);
	}

	return(defer.promise.then(this.db.connect(this.dbConf)).then(this.db.begin()));
};

/** Roll back current transaction and close connection. */
SldInserter.prototype.abort=function() {
	return(this.db.rollback().then(bindToScope(this.db,this.db.close)));
};

/** Commit current transaction and close connection. */
SldInserter.prototype.finish=function() {
	return(this.db.commit().then(bindToScope(this.db,this.db.close)));
};

/** Read a file and retuŕn its contents in a promise.
  * @param {string} path File to read.
  * @param {string} name Description of the file for error messages.
  * @return {Promise} */
SldInserter.prototype.readFile=function(path,name) {
	var defer=new Deferred();

	fs.readFile(path,{encoding:'utf-8'},function(err,data) {
		if(err) defer.reject('Unable to read '+name+' from '+path+': '+err);
		defer.resolve(data);
	})

	return(defer.promise);
};

/** Read entire text contents of an SLD template and insert them into a single
  * database row.
  * @param {string} templatePath Path of file to read.
  * @return {Promise} */
SldInserter.prototype.insertTemplate=function(templatePath) {
	var self=this;

	return(this.readFile(templatePath,'SLD template').then(function(sldTemplate) {
		return(self.db.querySingle(
			'INSERT INTO sld_template (content,name)'+
			' VALUES ($1,$2)'+
			' RETURNING id',[sldTemplate,'foobar']
		));
	}));
};

/** @param {number} templateId Refers to a template in the database.
  * @return {Promise} */
SldInserter.prototype.insertFeatureType=function(templateId) {
	return(this.db.querySingle(
		'INSERT INTO sld_featuretype (template_id,name,title,featuretype_name)'+
		' VALUES ($1,$2,$3,$4)'+
		' RETURNING id',[templateId,'','','']
	));
};

/** @param {Promise} featureTypeInserted Should resolve to the ID of an
  * inserted feature type.
  * @param {Array.<string>} fieldList Data describing the feature type.
  * @return {Promise} */
SldInserter.prototype.insertRule=function(featureTypeInserted,fieldList) {
	var self=this;

	return(featureTypeInserted.then(function(featureTypeId) {
		var nameList=fieldList[3].split(';');
		if(!nameList[1]) nameList[1]=fieldList[4];
		return(self.db.querySingle(
			'INSERT INTO sld_rule (featuretype_id,name,title,abstract)'+
			' VALUES ($1,$2,$3,$4)'+
			' RETURNING id',[featureTypeId.id,nameList[0],nameList[1],nameList[2]]
		));
	}));
};

/** Insert an SLD parameter description into the database.
  * @param {Promise} ruleInserted Should resolve to the ID of an inserted rule.
  * @param {Array.<string>} fieldList Data describing the parameter type etc.
  * @return {Promise} */
SldInserter.prototype.insertParam=function(ruleInserted,fieldList) {
	var self=this;
	var defer=new Deferred();

	ruleInserted.then(function(ruleId) {
		var typeFound=self.db.querySingle(
			'SELECT id,name,symbolizer'+
			' FROM sld_type'+
			' WHERE symbolizer=$1',[fieldList[4]]
		);

		typeFound.then(function(typeRow) {
			self.db.querySingle(
				'INSERT INTO sld_param (rule_id,template_offset,type_id,default_value)'+
				' VALUES ($1,$2,$3,$4)'+
				' RETURNING id',[ruleId.id,fieldList[3],typeRow.id,fieldList[5]]
			).then(function() {
				defer.resolve();
			});
		});

		typeFound.catch(function() {
			return(self.db.querySingle(
				'INSERT INTO sld_type (name,symbolizer)'+
				' VALUES ($1,$2)'+
				' RETURNING id',['',fieldList[4]]
			));
		}).then(function(typeRow) {
			self.db.querySingle(
				'INSERT INTO sld_param (rule_id,template_offset,type_id,default_value)'+
				' VALUES ($1,$2,$3,$4)'+
				' RETURNING id',[ruleId.id,fieldList[3],typeRow.id,fieldList[5]]
			).then(function() {
				defer.resolve();
			});
		}).catch(function(err) {defer.reject(err);});
	});

	return(defer.promise);
};

/** Insert rule and parameter descriptions from parse.js into the database.
  * @param {string} sldConfig Entire config file text content to parse.
  * @param {number} templateId Refers to a template in the database.
  * @return {Promise} Resolved when everything has been successfully inserted. */
SldInserter.prototype.parseConfig=function(sldConfig,templateId) {
	var defer=new Deferred();
	/** A separate promise for each database INSERT command to track them. */
	var promiseList=[];
	var lineList;
	var lineNum,lineCount;
	var fieldList;
	var featureTypeInserted,ruleInserted,fieldInserted;

	lineList=sldConfig.split(/\r?\n/);
	lineCount=lineList.length;

	for(lineNum=0;lineNum<lineCount;lineNum++) {
		line=lineList[lineNum];
		if(!line) continue;
		fieldList=line.split('\t');

		type=fieldList[0];

		if(type=='FeatureType') {
			featureTypeInserted=this.insertFeatureType(templateId);
			featureTypeInserted.catch(function(err) {
				defer.reject('Error inserting feature type: '+err);
			});
			promiseList.push(featureTypeInserted);
		}

		if(type=='Rule') {
			ruleInserted=this.insertRule(featureTypeInserted,fieldList);
			ruleInserted.catch(function(err) {
				defer.reject('Error inserting rule: '+err);
			});
			promiseList.push(ruleInserted);
		}

		if(type=='Field') {
			paramInserted=this.insertParam(ruleInserted,fieldList);
			paramInserted.catch(function(err) {
				defer.reject('Error inserting field: '+err);
			});
			promiseList.push(paramInserted);
		}
	}

	// Ready when all inserts finish.
	Promise.all(promiseList).then(function() {
		defer.resolve();
	});

	return(defer.promise);
};

/** Read SLD parameters and store them associated with templateId in the database.
  * @param {string} configPath Path of file with parameter descriptions.
  * @param {number} templateId Refers to a template in the database.
  * @return {Promise} Resolved when everything has been successfully inserted. */
SldInserter.prototype.insertConfig=function(configPath,templateId) {
	var self=this;
	var inputReady=this.readFile(configPath,'SLD config');

	return(inputReady.then(function(sldConfig) {
		return(self.parseConfig(sldConfig,templateId));
	}));
};

/** Main function, reads input and writes output. */
function run() {
	var inserter=new SldInserter();

	var connected=inserter.connect('db.json');

	var templateInserted=connected.then(function() {
		return(inserter.insertTemplate(process.argv[2]));
	});

	var configInserted=templateInserted.then(function(templateRow) {
		return(inserter.insertConfig(process.argv[3],templateRow.id));
	});

	var ready=configInserted;

	ready.catch(function(err) {
		inserter.abort();
		console.error(err);
		return;
	});

	ready.then(function() {
		return(inserter.finish());
	}).then(function() {
		console.log('Success!');
	});
}

// This is where the program actually begins.
run();