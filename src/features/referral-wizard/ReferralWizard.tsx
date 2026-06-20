import type { ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Patient } from "@/types";
import { getPatient } from "@/data/patients";
import { useReferralStore, type WizardStep } from "@/store/useReferralStore";
import { Card } from "@/components/ui";
import { WizardStepper } from "./WizardStepper";
import { PatientContextCard } from "./parts";
import { Step1Intent } from "./steps/Step1Intent";
import { Step2Safety } from "./steps/Step2Safety";
import { Step3Pathway } from "./steps/Step3Pathway";
import { Step4Readiness } from "./steps/Step4Readiness";
import { Step5Routing } from "./steps/Step5Routing";
import { StepDelivery } from "./steps/StepDelivery";
import { Step6Draft } from "./steps/Step6Draft";
import { Step7Sent } from "./steps/Step7Sent";

const STEP_COMPONENT: Record<WizardStep, ComponentType<{ patient: Patient }>> = {
  intent: Step1Intent,
  safety: Step2Safety,
  pathway: Step3Pathway,
  readiness: Step4Readiness,
  routing: Step5Routing,
  delivery: StepDelivery,
  draft: Step6Draft,
  sent: Step7Sent,
};

export function ReferralWizard({ patientId }: { patientId: string }) {
  const step = useReferralStore((s) => s.step);
  const close = useReferralStore((s) => s.closeReferral);
  const patient = getPatient(patientId);
  const StepComponent = STEP_COMPONENT[step];

  return (
    <div className="space-y-5">
      <Card className="flex items-center gap-3 py-3 sm:gap-4 sm:py-4">
        <div className="min-w-0 flex-1">
          <WizardStepper current={step} />
        </div>
        <button
          onClick={close}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sand-400 transition-colors hover:bg-sand-100 hover:text-sand-600"
          title="Close referral"
        >
          <X className="h-4 w-4" />
        </button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:gap-5">
        <div className={step === "sent" ? "hidden lg:block" : ""}>
          <PatientContextCard patient={patient} />
        </div>

        <Card className="min-h-[360px] sm:min-h-[420px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <StepComponent patient={patient} />
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
