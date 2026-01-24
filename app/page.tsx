import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { ContactSection } from "@/components/landing/contact-section";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <FeaturesSection />
      <ContactSection />
      <footer className="bg-gray-900 text-gray-400 py-8 px-4 text-center">
        <p>&copy; {new Date().getFullYear()} LeadGen. All rights reserved.</p>
      </footer>
    </main>
  );
}
