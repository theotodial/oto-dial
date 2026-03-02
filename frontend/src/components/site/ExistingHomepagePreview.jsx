import NewHeroSection from "../homepage/NewHeroSection";
import NewFeaturesSection from "../homepage/NewFeaturesSection";
import NewHowItWorks from "../homepage/NewHowItWorks";
import NewPricingSection from "../homepage/NewPricingSection";
import NewFooter from "../homepage/NewFooter";

// This renders the current "live" homepage implementation (the static React components),
// so the builder can preview what users currently see before the site builder JSON exists.
function ExistingHomepagePreview() {
  return (
    <div className="w-full bg-white dark:bg-slate-900">
      <NewHeroSection />
      <NewFeaturesSection />
      <NewHowItWorks />
      <NewPricingSection />
      <NewFooter />
    </div>
  );
}

export default ExistingHomepagePreview;

