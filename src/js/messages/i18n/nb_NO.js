(function($) {

	// norwegian - norway

	var Alpaca = $.alpaca;

	Alpaca.registerView ({
		"id": "base",
		"messages": {
            "nb_NO": {
                required: "Feltet er obligatorisk",
                invalid: "Verdien er ugyldig",
                months: ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"],
                timeUnits: {
                    SECOND: "Sekunder",
                    MINUTE: "Minutter",
                    HOUR: "Timer",
                    DAY: "Dager",
                    MONTH: "Måneder",
                    YEAR: "År"
                },
                "notOptional": "Dette feltet er obligatorisk",
                "disallowValue": "Denne verdien er ikke tillatt: {0}",
                "invalidValueOfEnum": "Feltet må inneholde en av følgende verdier: {0}. Nåværende verdi er: {1}",
                "notEnoughItems": "Det minste tillatte antallet elementer er {0}",
                "tooManyItems": "Det største tillatte antallet elementer er {0}",
                "valueNotUnique": "Verdiene er ikke unike",
                "notAnArray": "Ikke en liste av verdier",
                "invalidDate": "Ugyldig datoformat: {0}",
                "invalidEmail": "Ugyldig e-postadresse",
                "stringNotAnInteger": "Verdien er ikke et heltall",
                "invalidIPv4": "Ugyldig IPv4-adresse",
                "stringValueTooSmall": "Den minste tillatte verdien er {0}",
                "stringValueTooLarge": "Den største tillatte verdien er {0}",
                "stringValueTooSmallExclusive": "Verdien må være større enn {0}",
                "stringValueTooLargeExclusive": "Verdien må være mindre enn {0}",
                "stringDivisibleBy": "Tallet må være delbart med {0}",
                "stringNotANumber": "Verdien er ikke et tall",
                "invalidPassword": "Ugyldig passord",
                "invalidPhone": "Ugyldig telefonnummer",
                "invalidPattern": "Feltet må være i følgende format: {0}",
                "stringTooShort": "Dette feltet må minst inneholde {0} tegn",
                "stringTooLong": "Dette feltet kan maks inneholde {0} tegn",
                "addItemButtonLabel": "Legg til element",
                "addButtonLabel": "Legg til",
                "removeButtonLabel": "Fjern",
                "upButtonLabel": "Opp",
                "downButtonLabel": "Ned",
                "impactAssessmentCriteriaLabel": "{0} – {1}: vurderingskriterium",
                "impactAssessmentCriteriaPlaceholder": "Beskriv kriteriet for dette nivået",
                "impactAssessmentLevelAxisTableCaption": "Vurderingskriterier: konsekvenskategori per konsekvensnivå",
                "impactAssessmentLegendLabel": "Fargeforklaring",
                "impactAssessmentTableCaption": "Konsekvensmatrise: konsekvenskategori per varighet av sammenhengende bortfall",
                "impactAssessmentCategoryHeader": "Konsekvenskategori",
                "impactAssessmentShowCriteria": "Vis vurderingskriterier",
                "impactAssessmentNoDescription": "Ingen beskrivelse.",
                "impactAssessmentDurationLabel": "Etter {0} timer",
                "impactAssessmentAssessed": "Vurdert",
                "impactAssessmentUnassessed": "Ikke vurdert",
                "impactAssessmentLevelLabel": "{0}: konsekvensnivå {1}.",
                "impactAssessmentLevelHint": "Klikk for neste nivå, Shift+klikk for forrige.",
                "impactAssessmentCommentLabel": "{0}: begrunnelse",
                "impactAssessmentCommentPlaceholder": "Begrunnelse",
                "impactAssessmentCommentAdd": "Legg til begrunnelse for {0}",
                "impactAssessmentCommentShow": "Vis begrunnelse for {0}",
                "impactAssessmentCommentMissing": "Begrunnelse mangler for {0} (påkrevd). Klikk for å legge til.",
                "impactAssessmentNotAssessed": "{0}: mangler vurdering.",
                "impactAssessmentIncompleteCount": "{0} celle(r) er ikke vurdert ennå.",
                "impactAssessmentInvalidLevel": "{0}: ugyldig konsekvensnivå.",
                "impactAssessmentCommentRequired": "{0}: begrunnelse er påkrevd.",
                "impactAssessmentSummaryCategory": "{0}: uakseptabel konsekvens fra og med \"{1}\".",
                "impactAssessmentSummaryIncomplete": "(Vurderingen er ikke fullstendig - manglende vurderinger skal ikke tolkes som akseptable.)",
                "impactAssessmentSummaryOverall": "Tidligste uakseptable konsekvens samlet sett: \"{0}\" ({1}).",
                "impactAssessmentDecreasingImpact": "{0}: konsekvensen synker fra \"{1}\" ({2}) til \"{3}\" ({4}) - bør begrunnes.",
                "impactAssessmentVersionMismatch": "Denne vurderingen ble gjort med konfigurasjon '{0}' versjon {1}, men feltet er satt opp med '{2}' versjon {3}. Vurderingen vises ikke, og endringer kan ikke lagres, før avviket er løst.",
                "impactAssessmentInvalidConfig": "Ugyldig konfigurasjon for konsekvensmatrisen: {0}",
                "impactAssessmentUnconfigured": "Dette konsekvensmatrise-feltet er ikke konfigurert ennå (options.config mangler).",
                "impactAssessmentExampleCategoryLabel": "Kategori 1",
                "impactAssessmentExampleLevelNone": "Ingen",
                "impactAssessmentExampleLevelLow": "Lav",
                "impactAssessmentExampleLevelHigh": "Høy",
                "impactAssessmentExampleLevelCritical": "Kritisk"
            }
		}
	});

})(jQuery);
