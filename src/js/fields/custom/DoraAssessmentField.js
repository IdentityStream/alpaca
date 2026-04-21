(function($) {

    var Alpaca = $.alpaca;

    Alpaca.Fields.DoraAssessmentField = Alpaca.Fields.RadioField.extend({
        firstUpdate: true,

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
                "DoraAssessmentEconomicImpact",
                "DoraReportedByThirdParty"
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
            if(self.options.updateCauses) {
                var doraCausesFields = [
                    "DoraFinalReportHighLevelRootCause",
                    "DoraFinalReportDetailedClassificationHumanError",
                    "DoraFinalReportDetailedClassificationProcessFailure",
                    "DoraFinalReportDetailedClassificationExternalEvent",
                ]
                doraCausesFields.forEach(function (doraCauseField){
                    var doraAlpacaField = self.parent.childrenByPropertyId[doraCauseField];
                    if (doraAlpacaField) {
                        doraAlpacaField.getFieldEl().bind("fieldupdate", function(event)
                            {
                                self.updateCauses();
                            }
                        );
                    }
                });
                self.updateCauses();
            }
        },

        updateCauses: function() {
            var self = this;
            //Set high level cause
            var causeValue = self.parent.childrenByPropertyId["IncidentWhy"].getValue();
            var originalCauseLength = causeValue.length;
            var DoraFinalReportHighLevelRootCauseValue = self.parent.childrenByPropertyId["DoraFinalReportHighLevelRootCause"].getValue();
            var DoraFinalReportDetailedClassificationHumanErrorValue = self.parent.childrenByPropertyId["DoraFinalReportDetailedClassificationHumanError"].getValue();
            var DoraFinalReportDetailedClassificationProcessFailureValue = self.parent.childrenByPropertyId["DoraFinalReportDetailedClassificationProcessFailure"].getValue();
            var DoraFinalReportDetailedClassificationExternalEventValue = self.parent.childrenByPropertyId["DoraFinalReportDetailedClassificationExternalEvent"].getValue();
            if(DoraFinalReportHighLevelRootCauseValue.includes("malicious_actions")){
                if(!causeValue.includes("Criminality")){
                    causeValue.push("Criminality");
                }
            }
            if(DoraFinalReportHighLevelRootCauseValue.includes("system_failure_malfunction")){
                if(!causeValue.includes("System")){
                    causeValue.push("System");
                }
            }
            if(DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_miscommunication")){
                if(!causeValue.includes("Communication")){
                    causeValue.push("Communication");
                }
            }
            if(DoraFinalReportDetailedClassificationExternalEventValue.includes("external_event_natural_disasters_force_majeure")){
                if(!causeValue.includes("ForceMajeure")){
                    causeValue.push("ForceMajeure");
                }
            }
            if(DoraFinalReportDetailedClassificationProcessFailureValue.includes("process_failure_insufficient_monitoring_or_failure_of_monitoring_and_control")){
                if(!causeValue.includes("Controll")){
                    causeValue.push("Controll");
                }
            }
            if(DoraFinalReportDetailedClassificationProcessFailureValue.includes("process_failure_inadequacy_of_internal_policies_procedures_and_documentation")){
                if(!causeValue.includes("Process")){
                    causeValue.push("Process");
                }
            }
            if( DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_skills_knowledge") || 
                DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_inadequate_human_resources") ||
                DoraFinalReportDetailedClassificationProcessFailureValue.includes("process_failure_insufficient_unclear_roles_and_responsibilities")){
                if(!causeValue.includes("CompetenceAndCapacity")){
                    causeValue.push("CompetenceAndCapacity");
                }
            }
            if( DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_omission") || 
                DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_mistake") ||
                DoraFinalReportDetailedClassificationExternalEventValue.includes("external_event_third-party_failures")){
                if(!causeValue.includes("Human error")){
                    causeValue.push("Human error");
                }
            }
            if(originalCauseLength != causeValue.length) {
                self.parent.childrenByPropertyId["IncidentWhy"].setValue(causeValue);
                self.parent.childrenByPropertyId["IncidentWhy"].triggerUpdate();
            }
            //Set detailed cause
            if( DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_omission")){
                var competenceValue = self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].getValue();
                if(!competenceValue.includes("Training")){
                    competenceValue.push("Training");
                    self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].setValue(competenceValue);
                    self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].triggerUpdate();
                }
            }
            if( DoraFinalReportDetailedClassificationHumanErrorValue.includes("human_error_omission")){
                var competenceValue = self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].getValue();
                if(!competenceValue.includes("Training")){
                    competenceValue.push("Training");
                    self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].setValue(competenceValue);
                    self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].triggerUpdate();
                }
            }
            if( DoraFinalReportDetailedClassificationProcessFailureValue.includes("process_failure_insufficient_unclear_roles_and_responsibilities")){
                var competenceValue = self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].getValue();
                if(!competenceValue.includes("NonExistingResponsibility")){
                    competenceValue.push("NonExistingResponsibility");
                    self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].setValue(competenceValue);
                    self.parent.childrenByPropertyId["CompetanceAndCapacityCategory"].triggerUpdate();
                }
            }
        },
        
        updateDoraAssessment: function() {
            var self = this;
            var currentValue = self.getValue();
            var doraAssessment = "No";
            if(self.parent.childrenByPropertyId["DoraReportedByThirdParty"].getValue() === "Yes") {
                doraAssessment = "YesReportedByThirdParty";
                if (self.firstUpdate || doraAssessment !== currentValue) {
                    self.setValue(doraAssessment);
                }
                return;
            }
            if(self.parent.childrenByPropertyId["DoraAssessmentIsACriticalServiceAffected"].getValue() !== "Yes") {
                if (self.firstUpdate || doraAssessment !== currentValue) {
                    self.setValue(doraAssessment);
                }
                return;
            }

            if(self.parent.childrenByPropertyId["DoraAssessmentUnauthorizedAccess"].getValue() === "Yes") {
                doraAssessment = "Yes";
                if (self.firstUpdate || doraAssessment !== currentValue) {
                    self.setIncidentClassificationDateTime();
                    self.setValue(doraAssessment);
                }
                return;
            }
            var additionalCriteria = [
                { field: "DoraAssessmentClients", consequences: ["Customer"] },
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
            if(self.firstUpdate || doraAssessment !== currentValue) {
                if(doraAssessment === "Yes") {
                    self.setIncidentClassificationDateTime();
                }
                self.setValue(doraAssessment);
            }
        },

        afterSetValue: function()
        {
            this.base();
            this.firstUpdate = false;
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
                        },
                        updateCauses: {
                            title: "Update causes",
                            description: "Updates the causes based on DORA selection.",
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
                        },
                        updateCauses: {
                            rightLabel: "Update causes based on DORA selection?",
                            "type": "checkbox",
                        }
                    }
                });
                return optionsForOptions;
            }
    });

    Alpaca.registerFieldClass("DoraAssessment", Alpaca.Fields.DoraAssessmentField);

})(jQuery);