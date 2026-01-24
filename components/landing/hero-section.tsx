export function HeroSection() {
  return (
    <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">
          Grow Your Business with Quality Leads
        </h1>
        <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Connect with potential customers and accelerate your growth.
          Our platform helps you capture and manage leads effortlessly.
        </p>
        <a
          href="#contact"
          className="inline-block bg-white text-blue-600 font-semibold px-8 py-4 rounded-lg hover:bg-blue-50 transition-colors text-lg"
        >
          Get Started Today
        </a>
      </div>
    </section>
  );
}
