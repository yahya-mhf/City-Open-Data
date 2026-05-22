"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl"><span className="text-gray-400">Loading map...</span></div>,
});

const CATEGORIES = [
  "street_light",
  "pothole",
  "garbage",
  "noise_complaint",
  "water_leak",
  "traffic_issue",
  "air_quality",
  "other",
];

const MAX_DESC_LENGTH = 500;

function ReportForm() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImage(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("category", category);
      formData.append("description", description);
      formData.append("latitude", latitude);
      formData.append("longitude", longitude);
      if (image) formData.append("image", image);

      await api.reports.create(formData, token);
      router.push("/reports");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please <Link href="/login" className="text-primary-600">login</Link> to submit a report.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Submit Report</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">Send a location-tagged civic issue to city operators.</p>
        </div>
        <Card className="p-8">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 dark:bg-red-900/20 dark:text-red-300">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Category</label>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                maxLength={MAX_DESC_LENGTH}
                rows={4}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/{MAX_DESC_LENGTH}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Location</label>
              <LocationPicker
                latitude={latitude}
                longitude={longitude}
                onLocationChange={(lat, lng) => {
                  setLatitude(lat);
                  setLongitude(lng);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Photo (optional)</label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
              />
              {imagePreview && (
                <div className="mt-2 relative inline-block">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="h-32 w-48 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      URL.revokeObjectURL(imagePreview);
                      setImagePreview(null);
                    }}
                    variant="danger"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  >
                    &times;
                  </Button>
                </div>
              )}
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? "Submitting..." : "Submit Report"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

export default function NewReportPage() {
  return <ReportForm />;
}
