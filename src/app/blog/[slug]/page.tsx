import { notFound } from "next/navigation";
import { posts } from "../data";
import BlogPostContent from "./BlogPostContent";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = posts.find((p) => p.slug === params.slug);
  if (!post) return { title: "Post Not Found" };
  return {
    title: `${post.title} | Futuri`,
    description: post.excerpt,
  };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = posts.find((p) => p.slug === params.slug);
  if (!post) notFound();

  const relatedPosts = posts
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

  return <BlogPostContent post={post} relatedPosts={relatedPosts} />;
}
