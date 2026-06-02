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
  const [ineligibleQuestion, setIneligibleQuestion] = useState<Types.Question | null>(null);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/questions", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        const all = (payload.questions ?? []) as Types.Question[];
        setQuestions(all.sort((a, b) => a.displayOrder - b.displayOrder));
      })
      .catch(() => setQuestions([]));
    const savedAnswers = getIntakeState().questionnaireAnswers || {};
    answersRef.current = savedAnswers;
    setAnswers(savedAnswers);
  }, []);

  const setAnswer = (id: string, val: string) => {
    const next = { ...answersRef.current, [id]: val };
    answersRef.current = next;
    setAnswers(next);
    saveIntakeState({ questionnaireAnswers: next });
    // Clear ineligibility if answer changes
    setIneligibleQuestion(null);
    setMissingRequired((prev) => prev.filter((questionId) => questionId !== id));
  };

  const toggleMultiAnswer = (id: string, option: string, checked: boolean) => {
    const current = (answersRef.current[id] || "").split(",").map((item) => item.trim()).filter(Boolean);
    const answer = isNoneOption(option)
      ? (checked ? option : "")
      : (checked
          ? Array.from(new Set([...current.filter((item) => !isNoneOption(item)), option]))
          : current.filter((item) => item !== option)
        ).join(", ");
    const next = { ...answersRef.current, [id]: answer };
    answersRef.current = next;
    setAnswers(next);
    saveIntakeState({ questionnaireAnswers: next });
    setIneligibleQuestion(null);
    setMissingRequired((prev) => prev.filter((questionId) => questionId !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentAnswers = answersRef.current;

    const missing = questions
      .filter((question) => question.required && !currentAnswers[question.id]?.trim())
      .map((question) => question.id);

    if (missing.length) {
      setMissingRequired(missing);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const submittedAnswers = Object.entries(currentAnswers).map(([questionId, answer]) => ({
      id: `answer_${questionId}`,
      orderId: "pending",
      questionId,
      answer,
      createdAt: new Date().toISOString(),
    }));
    const eligibility = checkEligibility(submittedAnswers, questions);
    const disqualifier = eligibility.disqualifyingQuestion
      ? questions.find((question) => question.text === eligibility.disqualifyingQuestion)
      : null;

    if (disqualifier) {
      setIneligibleQuestion(disqualifier);
      // Scroll to top to show the message
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    saveIntakeState({ questionnaireAnswers: currentAnswers });
    router.push("/start/consent");
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

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 text-left mb-8 max-w-md mx-auto">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-sm mb-1">Why we cannot proceed</p>
                <p className="text-amber-700 text-sm leading-relaxed">
                  GLP-1 medications such as Tirzepatide are contraindicated for patients with a personal or family history of thyroid cancer, MEN 2, or who are currently pregnant or breastfeeding. Your safety is our priority.
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-6">
            Please consult with your primary care physician about alternative treatment options. Your answers were not saved and no charge was applied.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setIneligibleQuestion(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-7">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Health Questionnaire</h2>
        <p className="text-gray-500 text-sm mb-8">
          Please answer honestly - this helps our providers determine if treatment is right for you.
        </p>
        {missingRequired.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            Please answer every required question before continuing.
          </div>
        )}

        {questions.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-forest-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Loading questions...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {questions.map((question, idx) => (
              <div key={question.id} className="border-b border-gray-50 pb-7 last:border-0 last:pb-0">
                <label className="block text-sm font-semibold text-gray-800 mb-3">
                  <span className="text-forest-700 mr-1.5">{idx + 1}.</span>
                  {question.text}
                  {question.required && <span className="text-red-400 ml-1">*</span>}
                </label>

                {question.type === "text" && question.id === "pq_height" && (
                  <HeightPicker value={answers[question.id] || ""} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.type === "text" && (question.id === "pq_current_weight" || question.id === "pq_ideal_weight") && (
                  <WeightInput value={answers[question.id] || ""} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.type === "text" && question.id !== "pq_height" && question.id !== "pq_current_weight" && question.id !== "pq_ideal_weight" && (
                  <Input value={answers[question.id] || ""} onChange={(e) => setAnswer(question.id, e.target.value)} />
                )}
                {question.type === "textarea" && (
                  <Textarea value={answers[question.id] || ""} onChange={(e) => setAnswer(question.id, e.target.value)} rows={3} />
                )}
                {question.type === "radio" && (
                  <div className="space-y-2">
                    {question.options?.map((option) => (
                      <label key={option} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        answers[question.id] === option && question.disqualifying === option
                          ? "border-red-300 bg-red-50"
                          : "border-gray-100 hover:bg-gray-50 has-[:checked]:border-green-200 has-[:checked]:bg-green-50"
                      }`}>
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={(e) => setAnswer(question.id, e.target.value)}
                          className="accent-forest-800"
                        />
                        <span className="text-sm text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                )}
                {question.type === "checkbox" && (
                  <div className="space-y-2">
                    {(question.options?.length ? question.options : ["Yes"]).map((option) => {
                      const selected = (answers[question.id] || "").split(",").map((item) => item.trim()).includes(option);
                      return (
                        <label key={option} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 has-[:checked]:border-green-200 has-[:checked]:bg-green-50 transition-all">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => toggleMultiAnswer(question.id, option, e.target.checked)}
                            className="accent-forest-800"
                          />
                          <span className="text-sm text-gray-700">{option}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {missingRequired.includes(question.id) && (
                  <p className="mt-2 text-sm text-red-500">This question is required.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button fullWidth variant="outline" type="button" onClick={() => router.push("/start/info")}>
          Back
        </Button>
        <Button fullWidth type="submit">Continue</Button>
      </div>
    </form>
  );
}
