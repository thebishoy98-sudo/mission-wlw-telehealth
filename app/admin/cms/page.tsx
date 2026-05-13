"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import * as db from "@/lib/db";
import * as Types from "@/types";
import { Toast } from "@/components/ui/Toast";

export default function CMSEditor() {
  const [cms, setCms] = useState<Types.CMSContent | null>(null);
  const [toast, setToast] = useState<string>("");

  useEffect(() => {
    setCms(db.cmsDb.getContent());
  }, []);

  if (!cms) return null;

  const handleSave = () => {
    if (!cms) return;
    db.cmsDb.updateContent(cms);
    setToast("Content saved successfully!");
  };

  const updateLanding = (field: string, value: string) => {
    setCms((prev) =>
      prev
        ? {
            ...prev,
            landing: { ...prev.landing, [field]: value },
          }
        : null
    );
  };

  const updateFooter = (field: string, value: string) => {
    setCms((prev) =>
      prev
        ? {
            ...prev,
            footer: { ...prev.footer, [field]: value },
          }
        : null
    );
  };

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="admin" />
      <div className="container-max py-12 max-w-2xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Website Content Editor</h1>

        {/* Landing Page */}
        <Card className="mb-8">
          <CardContent className="p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Landing Page</h2>

            <Textarea
              label="Hero Headline"
              value={cms.landing.heroHeadline}
              onChange={(e) =>
                updateLanding("heroHeadline", e.target.value)
              }
              rows={2}
            />

            <Textarea
              label="Hero Subheadline"
              value={cms.landing.heroSubheadline}
              onChange={(e) =>
                updateLanding("heroSubheadline", e.target.value)
              }
              rows={3}
            />

            <Input
              label="CTA Button Text"
              value={cms.landing.ctaButtonText}
              onChange={(e) =>
                updateLanding("ctaButtonText", e.target.value)
              }
            />

            <Textarea
              label="Disclaimer Text"
              value={cms.landing.disclaimerText}
              onChange={(e) =>
                updateLanding("disclaimerText", e.target.value)
              }
              rows={3}
            />

            <Textarea
              label="Privacy Note"
              value={cms.landing.privacyNote}
              onChange={(e) =>
                updateLanding("privacyNote", e.target.value)
              }
              rows={2}
            />
          </CardContent>
        </Card>

        {/* Footer */}
        <Card className="mb-8">
          <CardContent className="p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Footer</h2>

            <Textarea
              label="Copyright Text"
              value={cms.footer.copyrightText}
              onChange={(e) =>
                updateFooter("copyrightText", e.target.value)
              }
              rows={2}
            />

            <Input
              label="Support Email"
              value={cms.footer.supportEmail}
              onChange={(e) =>
                updateFooter("supportEmail", e.target.value)
              }
            />
          </CardContent>
        </Card>

        <Button fullWidth size="lg" onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
    {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </>
  );
}
