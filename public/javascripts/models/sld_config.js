define(['lodash','backbone'], function(_, Backbone) {
	var SLDconfigModel = Backbone.Model.extend({
		defaults: {
			id: null,
			uuid: null,
			template_id: null,
			name: null,
			output_path: null,
			created: null,
			updated: null
		},
		urlRoot: "./api/v1/configs",

		//TODO
		// Validate model
		validation: {
			name: {
				required: true,
				msg: 'Model name is not valid!'
			},
			template_id: {
				required: true
			},
			id: {
				required: true
			}
			/** next are all attributes of the model, but they don't have validation yet
			created: {

			output_path: {

			}
			sld_values: {
				// values are validated before setting them to model
			}
			updated: {

			}
			uuid: {

			}
			*/
		},

		/**
		validate: function(attributes) {
			debugger;
			console.log('Validating...', attributes, this.isNew());

			if (!this.isNew() && !_.isString(attributes.id)) {
				return "Id must be a string.";
			}
			if (!_.isString(attributes.name)) {
				return "Name must be a string.";
			}
		},
		*/
		getSLDValuesByParams: function(params) {
			var sld_values = this.get('sld_values');
			var valueslist = _.map(params, function (param) {
				var newparam = _.findWhere(sld_values, {"param_id" : param.id});
					newparam.name = param.param_path;
					newparam.attributeName = param.name;
					return newparam;
				});
			return valueslist;
		}
	});

	return SLDconfigModel;
});