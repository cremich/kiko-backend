# Contributing Guide

First off, thank you for considering contributing to the KIKO app. It’s people like you that make a difference. Pull requests are welcome. For major changes, please open
an [issue](https://github.com/cremich/kiko-backend/issues) first to discuss what you would like to change.

## Pull Requests

We use the [GitHub flow](https://guides.github.com/introduction/flow/) as main versioning workflow. In a nutshell:

1. Fork this repository
2. Create a new branch for each feature, fix or improvement
3. Send a pull request from each feature branch to the **main** branch

## Git Commit Guidelines

We have rules over how our git commit messages must be formatted. Please ensure to
[squash](https://help.github.com/articles/about-git-rebase/#commands-available-while-rebasing) unnecessary commits so that your commit history is clean.

If the commit only involves documentation changes you can skip the continuous integration pipelines using `[ci skip]` or `[skip ci]` in your commit message header.

All commits SHOULD adhere to the [Conventional Commits specification](https://conventionalcommits.org/). Depending on the type of your change, please choose one of the following to give your commit some more semantic context:

- **feat:** a commit of the type feat introduces a new feature to the codebase (this correlates with MINOR in Semantic Versioning).
- **fix:** a commit of the type fix patches a bug in your codebase (this correlates with PATCH in Semantic Versioning).
- **task:** general changes like adding documentation, formatting code, ...
