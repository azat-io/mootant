import { frontmatter as branding } from '../content/community/branding.mdx'

/**
 * Metadata shared by Community pages, navigation, search and social cards. The
 * repository Markdown files keep their content without site frontmatter.
 */
export let communityPages = {
  contributing: {
    description:
      'Help improve Mootant: report issues, suggest features, add mutators and contribute code.',
    url: '/community/contributing',
    title: 'Contributing',
  },
  changelog: {
    description:
      'Follow Mootant releases, new features, bug fixes and breaking changes.',
    url: '/community/changelog',
    title: 'Changelog',
  },
  branding: {
    description: String(branding['description']),
    title: String(branding['title']),
    url: '/community/branding',
  },
}
