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
                "DoraAssessmentClients",
                "DoraAssessmentDataLoss",
                "DoraAssessmentReputation",
                "DoraAssessmentDuration",
                "DoraAssessmentGeographicalSpread",
                "DoraAssessmentEconomicImpact"
            ];
            var numAdditionalCriteria = 0;
            additionalCriteria.forEach(function (additionalCriterion){
                 if(self.parent.childrenByPropertyId[additionalCriterion].getValue() === "Yes") {
                    numAdditionalCriteria++;
                 }
            });

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
        }
    });

    Alpaca.registerFieldClass("DoraAssessment", Alpaca.Fields.DoraAssessmentField);

})(jQuery);