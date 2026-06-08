"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import * as Types from "@/types";
import { getIntakeState, saveIntakeState } from "@/lib/intake-store";
import { checkEligibility } from "@/lib/eligibility";
import { AlertTriangle, XCircle } from "lucide-react";

const selectCls = "w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-700 text-sm bg-white appearance-none";
const noneOptionLabels = new Set(["None apply to me", "None of the above"]);

function isNoneOption(option: string) {
  return noneOptionLabels.has(option);
}

function HeightPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parseFeet = (v: string) => { const m = v.match(/^(\d+)/); return m ? m[1] : "5"; };
  const parseInches = (v: string) => { const m = v.match(/['\s](\d+)/); return m ? m[1] : "6"; };
  const [feet, setFeet] = useState(() => parseFeet(value));
  const [inches, setInches] = useState(() => parseInches(value));

  useEffect(() => { onChange(`${feet}'${inches}"`); }, [feet, inches]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="block text-xs text-gray-500 mb-1.5">Feet</label>
        <select value={feet} onChange={(e) => setFeet(e.target.value)} className={selectCls}>
          {[3,4,5,6,7].map((f) => <option key={f} value={f}>{f} ft</option>)}
        </select>
      </div>
      <div className="flex-1">
        <label className="block text-xs text-gray-500 mb-1.5">Inches</label>
        <select value={inches} onChange={(e) => setInches(e.target.value)} className={selectCls}>
          {Array.from({ length: 12 }, (_, i) => i).map((i) => (
            <option key={i} value={i}>{i} in</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function WeightInput({ value, onChange, placeholder = "e.g. 185" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative max-w-xs">
      <input
        type="number"
        inputMode="decimal"
        min={50}
        max={700}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 pr-14 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-700 text-sm"
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium pointer-events-none">lbs</span>
    </div>
  );
}

export default function Questionnaire() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Types.Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [ineligibleQuestion, setIneligibleQuestion] = useState<Types.Question | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/questions", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        const all = (payload.questions ?? []) as Types.Question[];
        setQuestions(all.sort((a, b) => a.displayOrder - b.displayOrder));
      })
      .catch(() => setQuestions([]));
    const saved = getIntakeState().questionnaireAnswers || {};
    answersRef.current = saved;
    setAnswers(saved);
  }, []);

  const setAnswer = (id: string, val: string) => {
    const next = { ...answersRef.current, [id]: val };
    answersRef.current = next;
    setAnswers(next);
    saveIntakeState({ questionnaireAnswers: next });
    setStepError(null);
  };

  const toggleMultiAnswer = (id: string, option: string, checked: boolean) => {
    const current = (answersRef.current[id] || "").split(",").map((s) => s.trim()).filter(Boolean);
    const answer = isNoneOption(option)
      ? (checked ? option : "")
      : (checked
          ? Array.from(new Set([...current.filter((s) => !isNoneOption(s)), option]))
          : current.filter((s) => s !== option)
        ).join(", ");
    const next = { ...answersRef.current, [id]: answer };
    answersRef.current = next;
    setAnswers(next);
    saveIntakeState({ questionnaireAnswers: next });
    setStepError(null);
  };

  const finalize = () => {
    const currentAnswers = answersRef.current;
    const submittedAnswers = Object.entries(currentAnswers).map(([questionId, answer]) => ({
      id: `answer_${questionId}`,
      orderId: "pending",
      questionId,
      answer,
      createdAt: new Date().toISOString(),
    }));
    const eligibility = checkEligibility(submittedAnswers, questions);
    const disqualifier = eligibility.disqualifyingQuestion
      ? questions.find((q) => q.text === eligibility.disqualifyingQuestion)
      : null;
    if (disqualifier) {
      setIneligibleQuestion(disqualifier);
      return;
    }
    saveIntakeState({ questionnaireAnswers: currentAnswers });
    router.push("/start/consent");
  };

  const handleNext = () => {
    const q = questions[step];
    if (q.required && !answersRef.current[q.id]?.trim()) {
      setStepError("Please answer this question before continuing.");
      return;
    }
    if (step < questions.length - 1) {
      setStep(step + 1);
      setStepError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      finalize();
    }
  };

  const handleBack = () => {
    setStepError(null);
    if (step === 0) {
      router.push("/start/info");
    } else {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (ineligibleQuestion) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            We&apos;re unable to process your request
          </h2>
          <p className="text-gray-500 text-base leading-relaxed mb-6 max-w-md mx-auto">
            Based on your response to <strong className="text-gray-700">&ldquo;{ineligibleQuestion.text}&rdquo;</strong>, you are not eligible for GLP-1 treatment at this time.
          </p>
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-left mb-8 max-w-md mx-auto">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 text-sm mb-1">Why we cannot proceed</p>
                <p className="text-red-700 text-sm leading-relaxed">
                  GLP-1 medications are contraindicated for patients with a personal or family history of thyroid cancer, MEN 2, or who are currently pregnant or breastfeeding. Your safety is our priority.
                </p>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            Please consult with your primary care physician about alternative treatment options. Your answers were not saved and no charge was applied.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={() => { setIneligibleQuestion(null); setStep(questions.length - 1); }}>
              Go Back &amp; Review Answers
            </Button>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Return to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
        <div className="w-8 h-8 border-2 border-forest-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading questions...</p>
      </div>
    );
  }

  const q = questions[step];
  const total = questions.length;
  const progress = ((step + 1) / total) * 100;
  const isLast = step === total - 1;

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span className="font-medium text-forest-700">Health Questionnaire</span>
          <span>Question {step + 1} of {total}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-forest-700 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-forest-700 mb-3">
          Question {step + 1}
        </p>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 leading-snug">
          {q.text}
          {q.required && <span className="text-red-400 ml-1">*</span>}
        </h2>

        {q.type === "text" && q.id === "pq_height" && (
          <HeightPicker value={answers[q.id] || ""} onChange={(v) => setAnswer(q.id, v)} />
        )}
        {q.type === "text" && (q.id === "pq_current_weight" || q.id === "pq_ideal_weight") && (
          <WeightInput value={answers[q.id] || ""} onChange={(v) => setAnswer(q.id, v)} />
        )}
        {q.type === "text" && q.id !== "pq_height" && q.id !== "pq_current_weight" && q.id !== "pq_ideal_weight" && (
          <Input value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
        )}
        {q.type === "textarea" && (
          <Textarea value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} rows={4} />
        )}
        {q.type === "radio" && (
          <div className="space-y-2">
            {q.options?.map((option) => (
              <label key={option} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                answers[q.id] === option && q.disqualifying === option
                  ? "border-red-300 bg-red-50"
                  : "border-gray-100 hover:bg-gray-50 has-[:checked]:border-forest-300 has-[:checked]:bg-forest-50"
              }`}>
                <input
                  type="radio"
                  name={q.id}
                  value={option}
                  checked={answers[q.id] === option}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="accent-forest-800"
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        )}
        {q.type === "checkbox" && (
          <div className="space-y-2">
            {(q.options?.length ? q.options : ["Yes"]).map((option) => {
              const selected = (answers[q.id] || "").split(",").map((s) => s.trim()).includes(option);
              return (
                <label key={option} className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 has-[:checked]:border-forest-300 has-[:checked]:bg-forest-50 transition-all">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleMultiAnswer(q.id, option, e.target.checked)}
                    className="accent-forest-800"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              );
            })}
          </div>
        )}

        {q.warnIf && answers[q.id] === q.warnIf && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            Note: Your response will be flagged for provider review before your order is dispatched.
          </div>
        )}
        {stepError && (
          <p className="mt-4 text-sm text-red-500">{stepError}</p>
        )}
      </div>

      {/* Nav */}
      <div className="flex gap-3">
        <Button variant="outline" type="button" onClick={handleBack} className="w-28 shrink-0">
          Back
        </Button>
        <Button fullWidth type="button" onClick={handleNext}>
          {isLast ? "Continue" : "Next →"}
        </Button>
      </div>
    </div>
  );
}
