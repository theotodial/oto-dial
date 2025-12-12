import HeroSection from '../components/homepage/HeroSection';
import FeaturesSection from '../components/homepage/FeaturesSection';
import HowItWorks from '../components/homepage/HowItWorks';
import PricingPreview from '../components/homepage/PricingPreview';
import TestimonialsPreview from '../components/homepage/TestimonialsPreview';
import FooterCTA from '../components/homepage/FooterCTA';

function Home() {
  return (
    <div>
      <HeroSection />
      <FeaturesSection />
      <HowItWorks />
      <PricingPreview />
      <TestimonialsPreview />
      <FooterCTA />
    </div>
  );
}

export default Home;

