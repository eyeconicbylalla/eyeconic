import React from 'react';
import type { BlogMedia, BlogOutlineItem } from '../../types/blog';

interface BlogArticleContentProps {
  title: string;
  subtitle?: string;
  contentHtml: string;
  featuredImage?: BlogMedia;
  outline?: BlogOutlineItem[];
}

const BlogArticleContent: React.FC<BlogArticleContentProps> = ({
  title,
  subtitle,
  contentHtml,
  featuredImage,
  outline,
}) => {
  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-lg leading-8 text-[#CBD5E1]">{subtitle}</p> : null}
        </div>

        {featuredImage?.url ? (
          <figure className="overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#0F172A] shadow-card-dark">
            <img
              src={featuredImage.url}
              alt={featuredImage.altText || title}
              className="h-full max-h-[28rem] w-full object-cover"
              loading="lazy"
            />
            {featuredImage.caption ? (
              <figcaption className="border-t border-white/[0.04] px-5 py-3 text-sm text-[#94A3B8]">
                {featuredImage.caption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        {outline && outline.length > 0 ? (
          <div className="rounded-3xl border border-white/[0.06] bg-[#18222E] p-5 lg:hidden">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#64748B]">On this page</p>
            <div className="space-y-2">
              {outline.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-sm text-[#CBD5E1] transition hover:text-[#18B6A4]"
                  style={{ paddingLeft: `${(item.level - 1) * 10}px` }}
                >
                  {item.text}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <div className="blog-prose" dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </article>
  );
};

export default BlogArticleContent;