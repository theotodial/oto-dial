import HeroSection from '../components/homepage/HeroSection';
import FeaturesSection from '../components/homepage/FeaturesSection';
import HowItWorks from '../components/homepage/HowItWorks';
import PricingPreview from '../components/homepage/PricingPreview';
import TestimonialsPreview from '../components/homepage/TestimonialsPreview';
import FooterCTA from '../components/homepage/FooterCTA';

function Home() {
  return (
    <div className="w-full">
      <HeroSection />
      <div className="py-8 md:py-12 lg:py-16">
        <FeaturesSection />
      </div>
      <div className="py-8 md:py-12 lg:py-16">
        <HowItWorks />
      </div>
      <div className="py-8 md:py-12 lg:py-16">
        <PricingPreview />
      </div>
      <div className="py-8 md:py-12 lg:py-16">
        <TestimonialsPreview />
      </div>
      <FooterCTA />
    </div>
  );
}

export default Home;

