import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LeadCaptureForm } from "@/components/forms/lead-capture-form";

export function ContactSection() {
  return (
    <section id="contact" className="py-20 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Get in Touch
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Ready to start generating more leads? Fill out the form below and
            we'll get back to you within 24 hours.
          </p>
        </div>
        <div className="max-w-xl mx-auto">
          <Card>
            <CardHeader>
              <h3 className="text-xl font-semibold text-gray-900">
                Contact Us
              </h3>
            </CardHeader>
            <CardContent>
              <LeadCaptureForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
