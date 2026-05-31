import type { ConsentRecord, Patient } from "@/types";

export const CONSENT_VERSION = "tirzepatide-fl-v1";

export function patientLegalName(patient: Pick<Patient, "firstName" | "lastName">) {
  return [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
}

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function doesSignatureMatchPatient(
  signedName: string,
  patient: Pick<Patient, "firstName" | "lastName">
) {
  const signature = normalizeName(signedName);
  const legalName = normalizeName(patientLegalName(patient));
  return !!signature && !!legalName && signature === legalName;
}

export function formatDateOfBirth(value?: string) {
  if (!value) return "Not supplied";
  const parts = value.split("T")[0]?.split("-") ?? [];
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function maskIpAddress(ipAddress?: string | null) {
  if (!ipAddress) return "not captured";
  const first = ipAddress.split(",")[0]?.trim() ?? "";
  if (!first) return "not captured";
  if (first.includes(".")) {
    const parts = first.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  if (first.includes(":")) {
    const parts = first.split(":").filter(Boolean);
    return parts.length > 2 ? `${parts.slice(0, 3).join(":")}:***` : `${first}:***`;
  }
  return first.length > 4 ? `${first.slice(0, 4)}***` : "***";
}

export function getRequestIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-client-ip")?.trim() ||
    undefined
  );
}

export function buildTreatmentConsentText(patient: Pick<Patient, "firstName" | "lastName" | "dateOfBirth">) {
  const patientName = patientLegalName(patient) || "Patient";
  const dob = formatDateOfBirth(patient.dateOfBirth);

  return `CONSENT FOR MEDICAL TREATMENT

Informed Consent Instructions: This is an informed consent document to provide written information about the treatment(s) regarding risks, benefits, and alternatives. It is important that you understand the information provided to you prior to proceeding with this treatment; please ask your healthcare professional any/all questions prior to signing this consent form.

Patient Name: ${patientName}
Date of Birth: ${dob}

I consent to treatment by Mission Weight Loss and Wellness using Tirzepatide (GIP/GLP-1 RA)/Pyridoxine (B6) injections for elective chronic weight management treatment.

Treatment benefits will vary by individual, but may include reduced appetite, feeling a sense of fullness for longer durations after eating, delayed gastric emptying, and increased fat-burning mechanisms which may result in weight loss. Additional therapeutic benefits related to weight management may include improved blood sugar levels and reduced risk of adverse cardiovascular events.

Purpose of Treatment and General Information:

What is Tirzepatide Weight Management Treatment: Tirzepatide weight management injections are used for weight loss along with a diet and exercise plan. These injections are delivered beneath the surface of the skin (subcutaneously) for chronic weight management in adults with obesity (BMI >30) or who are overweight (BMI >27) with at least one weight-related condition, including high blood pressure, diabetes type 2, and/or high cholesterol. Tirzepatide mimics both GIP and GLP-1 receptor agonist hormones, which trigger insulin creation, sensation of fullness, and appetite reduction.

What To Expect During Treatment: Your treatment provider will review your health and medication history to ensure you are a good candidate for weight loss injections. You may request nutrition and exercise recommendations to be used along with Tirzepatide injections for chronic weight management. You will be taught how to perform injections at home just below the surface of the skin and will be prescribed a dosage adjusted for your individual needs.

Common side effects include nausea, vomiting, diarrhea, indigestion, abdominal pain, constipation, fatigue, and dizziness. Multiple injections will be needed over several months to achieve desired results.

Dosing adjustments will be made by your treatment provider based on your body's response and any side effects you experience. A typical treatment regimen includes an initial series of weekly injections for 90 days, including follow-up and lab work. Maintenance injections may be necessary to maintain desired results.

By signing this consent form I understand that the treatment goal is weight loss, repeated injections may be necessary, and regular follow-up with my treatment provider is required.

Treatment Benefits:
- Weight reduction and/or weight management
- Improved blood sugar
- Reduced risk of adverse cardiovascular events related to obesity

Possible Risks and Side Effects:
- General side effects: discomfort, pinpoint bleeding, pain at the injection site, bruising, allergic reaction, damage to deeper structures, or gastrointestinal side effects.
- Gastrointestinal upset: nausea, vomiting, diarrhea, constipation, indigestion, belching, bloating, and abdominal pain.
- Fatigue, dizziness, headache, and low blood sugar, especially in patients with type 2 diabetes using insulin or sulfonylureas.
- Increased heart rate, allergic reaction or hypersensitivity, infection, pancreatitis, gallbladder inflammation or gallstones, gastrointestinal blockage or ileus, dehydration, acute kidney injury, renal impairment, thyroid C-cell tumors, and changes in vision.

This list is not exhaustive of all possible risks associated with Tirzepatide/Pyridoxine weight management treatment, as there are known and unknown side effects and risks associated with any medication or treatment.

Tirzepatide injections are contraindicated in patients who are pregnant or breastfeeding, have ever had Medullary Thyroid Cancer (MTC), have Multiple Endocrine Neoplasia Syndrome type 2 (MEN 2), or have ever had a serious allergic reaction to Tirzepatide or any ingredients in Tirzepatide, including compound formulations that may include vitamin B12 and/or vitamin B6.

Please tell your treatment provider if you plan to become pregnant, have or have had problems with your pancreas or kidneys, have type 1 diabetes, type 2 diabetes, diabetic retinopathy, take sulfonylureas or insulin, or have depression, mental health issues, and/or suicidal thoughts.

Possible Medication Interactions and/or Reduced Effectiveness:

I understand that certain herbal products, medications, supplements, and minerals may affect the way Tirzepatide works, resulting in reduced efficacy of treatment and/or additional side effects. Tirzepatide slows stomach emptying and can affect absorption of oral medications.

Liability Release Related to Adverse Effects:

I assume full liability for any adverse effects that may result from the non-negligent administration of the proposed treatment. I waive any claim in law or equity for redress of any grievance that I may have concerning or resulting from the treatment, except as that claim pertains to negligent administration.

I agree to assume full liability for any adverse effects of treatment.

By acknowledging this Consent Form I attest that my primary residence is within the State of Florida and I am being treated as a patient that resides in Florida. Any prescriptions mailed outside Florida are at my request as my secondary residence or temporary travel destination.

Treatment Liability Waiver:

I acknowledge that elective supplementation therapies, including Tirzepatide/Pyridoxine Weight Management Treatment, may be considered medically unnecessary. It may or may not mitigate, alleviate, or cure the condition for which it has been prescribed. Based on the risks and potential benefits of this proposed treatment, I have elected to receive this treatment by providers and staff at Mission Weight Loss and Wellness.

I understand that I may suspend or terminate my treatment at any time by informing my medical provider. I fully understand and confirm that this treatment may be considered unproven by scientific testing and peer-reviewed publications and therefore may be considered medically unnecessary or not currently indicated.

Therefore, in consideration for any treatment received, I agree to unconditionally defend, hold harmless, and release from liability the company and the individual that provided my treatment, the insured, additional insureds, officers, directors, and employees for any condition or result, known or unknown, that may arise as a consequence of treatment.

I understand and agree that any legal action of any kind related to any treatment I receive will be limited to binding arbitration using a single arbitrator agreed to by both parties.

I acknowledge and agree that I have carefully read the information on this page and understand that I may be giving up some important legal rights by signing.

Patient or Responsible Party Signature: ${patientName}`;
}

export function buildConsentCertificate(
  consent: Pick<ConsentRecord, "signedName" | "signedAt" | "ipAddress" | "consentVersion">,
  patient?: Pick<Patient, "firstName" | "lastName">
) {
  const signedName = consent.signedName || (patient ? patientLegalName(patient) : "Patient");
  const signedAt = new Date(consent.signedAt);
  const formattedDate = Number.isNaN(signedAt.getTime())
    ? consent.signedAt
    : signedAt.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
  const version = consent.consentVersion ? ` ${consent.consentVersion}` : "";
  return `e-signed by ${signedName} on ${formattedDate} from IP ${maskIpAddress(consent.ipAddress)} - Certificate${version}`;
}
