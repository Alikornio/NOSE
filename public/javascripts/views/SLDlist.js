define([
	'lodash',
	'backbone',
	'jquery',
	'bootstrap',
	'i18n!localization/nls/SLDlist',
	'text!templates/SLDlist.html',
	'models/sld_config'
], function(_, Backbone, $, Bootstrap, locale, SLDListTemplate, SLDconfigModel) {
	var SLDListView = Backbone.View.extend({
		el: '.page',
		template: _.template(SLDListTemplate),
		events: {
	        'click .delete': 'deleteConfig',
	        'click .upload': 'showUpload'
      	},
		initialize: function(params) {
            _.bindAll(this, 'render');
            this.configs = params.configs;
            this.templates = params.templates;
            console.log(this, arguments);
            console.log('AuthorView Initialized!', this.collection);
        },
        render: function() {
        	var localization = locale;
            $(this.el).html(this.template({SLDtemplates: this.templates.models, SLDconfigs: this.configs.models, SLDlist: localization}));
            return this;
        },
        deleteConfig: function () {
        	console.log(this.configs.models);
        	this.configs.models.destroy({
          		success: function () {
		            console.log('destroyed');
		            router.navigate('', {trigger:true});
          		}
        	});
        return false;
      	},
	});
	return SLDListView;
});
