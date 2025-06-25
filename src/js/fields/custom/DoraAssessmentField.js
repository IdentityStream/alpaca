(function($) {

    var Alpaca = $.alpaca;

    Alpaca.Fields.DoraAssessmentField = Alpaca.Fields.RadioField.extend({
        setup: function()
        {
            this.base();
            //need to do this after all fields have been rendered
            setTimeout(this.setupDoraFields.bind(this), 0);
        },

        getFieldType: function () {
            return "DoraAssessment";
        },

        getTitle: function () {
            return "Dora assessment";
        },

        getDescription: function () {
            return "Renders a dora assessment field.";
        },

        setupDoraFields: function (){
            var self = this
            var doraFields = [
                "DoraAssessmentIsACriticalServiceAffected",
                "DoraAssessmentUnauthorizedAccess",
                "DoraAssessmentClients",
                "DoraAssessmentDataLoss",
                "DoraAssessmentReputation",
                "DoraAssessmentDuration",
                "DoraAssessmentGeographicalSpread",
                "DoraAssessmentAffectedCountries",
                "DoraAssessmentEconomicImpact"
            ];
            doraFields.forEach(function (doraField){
                var doraAlpacaField = self.parent.childrenByPropertyId[doraField];
                if (doraAlpacaField) {
                     doraAlpacaField.getFieldEl().bind("fieldupdate", function(event)
                        {
                            self.updateDoraAssessment();
                        }
                    );
                }
            });
            self.updateDoraAssessment();
        },
        
        updateDoraAssessment: function() {
            var self = this;
            var currentValue = self.getValue();
            var doraAssessment = "No";
            if(self.parent.childrenByPropertyId["DoraAssessmentIsACriticalServiceAffected"].getValue() !== "Yes") {
                if (doraAssessment !== currentValue) {
                    self.setValue(doraAssessment);
                }
                return;
            }

            if(self.parent.childrenByPropertyId["DoraAssessmentUnauthorizedAccess"].getValue() === "Yes") {
                doraAssessment = "Yes";
                if (doraAssessment !== currentValue) {
                    self.setIncidentClassificationDateTime();
                    self.setValue(doraAssessment);
                }
                return;
            }
            var additionalCriteria =  [
                { field: "DoraAssessmentClients", consequences: ["Delivery"] },
                { field: "DoraAssessmentDataLoss", consequences: ["Information"] },
                { field: "DoraAssessmentReputation", consequences: ["Reputation", "Relations"] },
                { field: "DoraAssessmentDuration", consequences: ["Delivery"] },
                { field: "DoraAssessmentGeographicalSpread", consequences: ["Delivery"] },
                { field: "DoraAssessmentEconomicImpact", consequences: ["MonetaryValues"] },
            ];
            var numAdditionalCriteria = 0;
            var consequenceMatrixValue = self.parent.childrenByPropertyId["ConsequenceMatrix"].getValue();
            var originalConsequencesLength = consequenceMatrixValue.length;
            additionalCriteria.forEach(function (additionalCriterion){
                var additionalCriteriaValue = self.parent.childrenByPropertyId[additionalCriterion.field].getValue();
                 
                 if(additionalCriteriaValue === "Yes") {
                    numAdditionalCriteria++;
                     if(self.options.updateConsequences) {
                        additionalCriterion.consequences.forEach(function (consequence){
                            if(!consequenceMatrixValue.includes(consequence)){
                                consequenceMatrixValue.push(consequence);
                            }
                        })
                    }
                 }
            });
            if(originalConsequencesLength != consequenceMatrixValue.length) {
                self.parent.childrenByPropertyId["ConsequenceMatrix"].setValue(consequenceMatrixValue);
                self.parent.childrenByPropertyId["ConsequenceMatrix"].triggerUpdate();
            }
            if(numAdditionalCriteria > 1){
                doraAssessment = "Yes";
            }
            if(doraAssessment !== currentValue) {
                if(doraAssessment === "Yes") {
                    self.setIncidentClassificationDateTime();
                }
                self.setValue(doraAssessment);
            }

        },

        afterSetValue: function()
        {
            this.base();
            this.triggerUpdate();
        },

        setIncidentClassificationDateTime: function()
        {
            var incidentClassificationDateTimeHasValue = this.parent.childrenByPropertyId["DoraInitialNotificationIncidentClassificationDateTime"].getValue();
            if(!incidentClassificationDateTimeHasValue) {
                this.parent.childrenByPropertyId["DoraInitialNotificationIncidentClassificationDateTime"].setValue(new Date().toISOString());
            }
        },
        getSchemaOfOptions: function () {
                const schemaOfOptions = Alpaca.merge(this.base(), {
                    properties: {
                        updateConsequences: {
                            title: "Update consequences",
                            description: "Updates the consequences based on DORA selection.",
                            type: "boolean",
                            default: true
                        }
                    }
                });
                return schemaOfOptions;
            },

            getOptionsForOptions: function () {
                const optionsForOptions = Alpaca.merge(this.base(), {
                    fields: {
                        updateConsequences: {
                            rightLabel: "Update consequences based on DORA selection?",
                            "type": "checkbox",
                        }
                    }
                });
                return optionsForOptions;
            }
    });

    Alpaca.registerFieldClass("DoraAssessment", Alpaca.Fields.DoraAssessmentField);

})(jQuery);